import { Bug, CodeXml, Coffee } from 'lucide-react';

const externalLinkProps = {
  target: '_blank',
  rel: 'noreferrer',
} as const;

export function SupportLink() {
  return <a className="project-link support-link" aria-label="Support SliceMe on Buy Me a Coffee" href="https://buymeacoffee.com/slicemeweb" {...externalLinkProps}>
    <Coffee size={14} />
    <span>Buy Me a Coffee</span>
  </a>;
}

export function GitHubLinks() {
  return (
    <nav className="project-links" aria-label="Project links">
      <a className="project-link" aria-label="View SliceMe source" href="https://github.com/itymarcel/sliceme" {...externalLinkProps}>
        <CodeXml size={14} />
        <span>View SliceMe source</span>
      </a>
      <a className="project-link" aria-label="Report a SliceMe issue" href="https://github.com/itymarcel/sliceme/issues/new/choose" {...externalLinkProps}>
        <Bug size={14} />
        <span>Report an issue</span>
      </a>
      <a className="project-link" aria-label="Custom Orca on GitHub" href="https://github.com/itymarcel/custom-orca" {...externalLinkProps}>
        <CodeXml size={14} />
        <span>Custom Orca on GitHub</span>
      </a>
    </nav>
  );
}
