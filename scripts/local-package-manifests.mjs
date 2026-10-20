/** Keep host metadata separate from the shared local server payload. */
export function chatgptManifests(legacy, review, demo) {
  const { skills: _skills, mcpServers: _mcp, interface: listing, ...portable } = legacy;
  return {
    'plugin.json': {
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      ...portable,
      extensions: {
        'com.openai': {
          requires_local_executor: true,
          interface: listing,
          review: { test_cases: review, ...(demo && { demo_recording_url: demo }) },
        },
      },
    },
    'mcp.json': {
      $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
      mcpServers: {
        'docx-editor': {
          type: 'stdio',
          command: 'node',
          args: ['${PLUGIN_ROOT}/dist/cli.js', 'stdio'],
          cwd: '${PLUGIN_ROOT}',
        },
      },
    },
  };
}

export function claudeManifest(legacy, pkg) {
  return {
    manifest_version: '0.3',
    name: legacy.name,
    display_name: legacy.interface.displayName,
    version: legacy.version,
    description: legacy.description,
    long_description:
      'Preview Word documents with pages, tables, images, comments, and tracked changes. ' +
      'Open a local .docx file by path. The preview follows file changes and saves your edits. ' +
      'Your agent edits files with its own document tools. ' +
      'The server and editor run locally. You need no account or API key for this extension.',
    author: legacy.author,
    homepage: legacy.homepage,
    repository: pkg.repository,
    support: legacy.interface.supportURL,
    icon: 'assets/icon.png',
    keywords: legacy.keywords,
    license: legacy.license,
    privacy_policies: [legacy.interface.privacyPolicyURL],
    server: {
      type: 'node',
      entry_point: 'dist/cli.js',
      mcp_config: {
        command: 'node',
        args: ['${__dirname}/dist/cli.js', 'stdio'],
      },
    },
    compatibility: {
      platforms: ['darwin', 'win32'],
      runtimes: { node: '>=22.0.0' },
    },
    tools: [{ name: 'open_document', description: 'Show a .docx file in a live preview.' }],
  };
}
