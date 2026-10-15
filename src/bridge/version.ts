import metadata from '../../package.json' with { type: 'json' };

// Bundled with each entry point so standalone/moved MCP files need no package lookup.
export const version = metadata.version;
