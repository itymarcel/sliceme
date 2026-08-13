import io
import json
import struct
import unittest
import zipfile

from app.project_3mf import import_orca_project


def project_archive(*, settings=None, component=False, unit="millimeter"):
    if component:
        resources = '''
    <object id="1" type="model"><mesh><vertices>
      <vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/>
    </vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object>
    <object id="2" type="model"><components><component objectid="1" transform="1 0 0 0 1 0 0 0 1 5 0 0"/></components></object>'''
        object_id = "2"
    else:
        resources = '''
    <object id="1" type="model"><mesh><vertices>
      <vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/>
    </vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object>'''
        object_id = "1"
    model = f'''<?xml version="1.0" encoding="UTF-8"?>
<model unit="{unit}" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>{resources}</resources>
  <build><item objectid="{object_id}" transform="1 0 0 0 1 0 0 0 1 120 80 3"/></build>
</model>'''
    names = f'''<?xml version="1.0" encoding="UTF-8"?>
<config><object id="{object_id}"><metadata key="name" value="Imported bracket"/></object></config>'''
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as package:
        package.writestr("3D/3dmodel.model", model)
        package.writestr("Metadata/model_settings.config", names)
        if settings is not None:
            package.writestr("Metadata/project_settings.config", json.dumps(settings))
    return output.getvalue()


def component_bomb_archive(levels=20, build_items=1, fanout=2, empty_leaf=False):
    leaf = ('<object id="1" type="model"><components/></object>' if empty_leaf else
            '<object id="1" type="model"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object>')
    objects = [leaf]
    for object_id in range(2, levels + 2):
        child = object_id - 1
        components = ''.join(f'<component objectid="{child}"/>' for _ in range(fanout))
        objects.append(f'<object id="{object_id}" type="model"><components>{components}</components></object>')
    items = ''.join(f'<item objectid="{levels + 1}"/>' for _ in range(build_items))
    model = f'<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>{"".join(objects)}</resources><build>{items}</build></model>'
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as package:
        package.writestr("3D/3dmodel.model", model)
    return output.getvalue()


class OrcaProjectImportTest(unittest.TestCase):
    def test_imports_mesh_name_position_and_settings(self):
        defaults = {
            "machine_config": {"nozzle_diameter": "0.4"},
            "process_config": {"layer_height": "0.2"},
            "filament_config": {"filament_type": "PLA"},
        }
        imported = import_orca_project(project_archive(settings={
            "nozzle_diameter": "0.8",
            "layer_height": "0.32",
            "filament_type": ["PETG"],
            "future_orca_setting": "ignored",
            "machine_start_gcode": "M112",
        }), defaults)

        self.assertEqual(len(imported.models), 1)
        model = imported.models[0]
        self.assertEqual(model.name, "Imported bracket.stl")
        self.assertEqual(model.position, {"x": 125.0, "y": 85.0})
        self.assertEqual(len(model.stl), 84 + 50)
        self.assertEqual(struct.unpack_from("<I", model.stl, 80)[0], 1)
        normal = struct.unpack_from("<3f", model.stl, 84)
        self.assertAlmostEqual(sum(value * value for value in normal), 1.0, places=6)
        self.assertEqual(normal, (0.0, 0.0, 1.0))
        self.assertEqual(imported.config["machine_config"]["nozzle_diameter"], "0.8")
        self.assertEqual(imported.config["process_config"]["layer_height"], "0.32")
        self.assertEqual(imported.config["filament_config"]["filament_type"], ["PETG"])
        self.assertNotIn("future_orca_setting", imported.config["process_config"])
        self.assertNotIn("machine_start_gcode", imported.config["machine_config"])
        self.assertIn("2 unsupported or unsafe project settings", imported.warnings[0])

    def test_resolves_component_transforms(self):
        imported = import_orca_project(project_archive(component=True), {
            "machine_config": {}, "process_config": {}, "filament_config": {},
        })
        self.assertEqual(imported.models[0].position, {"x": 130.0, "y": 85.0})

    def test_converts_standard_units_to_millimeters(self):
        imported = import_orca_project(project_archive(unit="inch"), {
            "machine_config": {}, "process_config": {}, "filament_config": {},
        })
        self.assertEqual(imported.models[0].position, {"x": 3175.0, "y": 2159.0})

    def test_rejects_archives_without_buildable_meshes(self):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as package:
            package.writestr("3D/3dmodel.model", '<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources/><build/></model>')
        with self.assertRaisesRegex(ValueError, "buildable mesh"):
            import_orca_project(output.getvalue(), {
                "machine_config": {}, "process_config": {}, "filament_config": {},
            })

    def test_rejects_unsafe_archive_paths(self):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as package:
            package.writestr("../3D/3dmodel.model", "unsafe")
            package.writestr("3D/3dmodel.model", "<model/>")
        with self.assertRaisesRegex(ValueError, "unsafe path"):
            import_orca_project(output.getvalue(), {
                "machine_config": {}, "process_config": {}, "filament_config": {},
            })

    def test_rejects_non_finite_vertices(self):
        source = zipfile.ZipFile(io.BytesIO(project_archive()))
        output = io.BytesIO()
        with source, zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as package:
            for info in source.infolist():
                content = source.read(info.filename)
                if info.filename == "3D/3dmodel.model":
                    content = content.replace(b'x="0"', b'x="nan"', 1)
                package.writestr(info.filename, content)
        with self.assertRaisesRegex(ValueError, "finite"):
            import_orca_project(output.getvalue(), {
                "machine_config": {}, "process_config": {}, "filament_config": {},
            })

    def test_rejects_recursive_component_expansion_bombs(self):
        with self.assertRaisesRegex(ValueError, "component depth|expanded geometry"):
            import_orca_project(component_bomb_archive(), {
                "machine_config": {}, "process_config": {}, "filament_config": {},
            })

    def test_rejects_empty_shared_component_dag_bombs(self):
        with self.assertRaisesRegex(ValueError, "component instances"):
            import_orca_project(component_bomb_archive(levels=12, fanout=3, empty_leaf=True), {
                "machine_config": {}, "process_config": {}, "filament_config": {},
            })

    def test_rejects_too_many_build_items(self):
        with self.assertRaisesRegex(ValueError, "at most 12"):
            import_orca_project(component_bomb_archive(levels=0, build_items=13), {
                "machine_config": {}, "process_config": {}, "filament_config": {},
            })


if __name__ == "__main__":
    unittest.main()
