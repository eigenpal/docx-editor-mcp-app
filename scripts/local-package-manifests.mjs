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
      'See any .docx beside the conversation, page by page: fonts, tables, images, headers, ' +
      'footers, comments, and tracked changes. Ask Claude to open a local .docx by its path. ' +
      'When Claude edits the file with its own document tools, the preview updates and ' +
      'highlights what changed. Your own edits, comment replies, and accepted changes save ' +
      'back to the same file. DOCX Editor runs on your computer and needs no account or API key.',
    author: { ...legacy.author, url: 'https://github.com/eigenpal' },
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
