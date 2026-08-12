import { Coffee, Github } from 'lucide-react';

const externalLinkProps = {
  target: '_blank',
  rel: 'noreferrer',
} as const;

export function ProjectLinks() {
  return (
    <nav className="project-links" aria-label="Project links">
      <a className="project-link support-link" href="https://buymeacoffee.com/slicemeweb" {...externalLinkProps}>
        <Coffee size={14} />
        <span>Buy Me a Coffee</span>
      </a>
      <a className="project-link" aria-label="SliceMe repository" href="https://github.com/itymarcel/sliceme" {...externalLinkProps}>
        <Github size={14} />
        <span>SliceMe</span>
      </a>
      <a className="project-link" aria-label="Custom Orca repository" href="https://github.com/itymarcel/custom-orca" {...externalLinkProps}>
        <Github size={14} />
        <span>Custom Orca</span>
      </a>
    </nav>
  );
}
