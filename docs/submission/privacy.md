# docx-editor privacy policy

> **Draft for legal review.** Publish at https://www.docx-editor.dev/privacy.

Effective date: _to be set_

EigenPal, Inc. ("we") makes the docx-editor plugin for ChatGPT, Codex, and
other MCP hosts. This policy explains what the plugin does with your data.

## What the plugin processes

- **Documents you open in the viewer.** Your MCP host gives the viewer the
  file. The viewer shows and saves it on your device. The file does not pass
  through our servers.
- **Documents an agent sends as bytes.** When an agent shows a document with
  `open_document`, the document passes through our server once, in that
  request, and goes back to your viewer.
- **Technical data.** Our hosting provider, _to be named_, logs request
  metadata, such as time and IP address, for security and operations. Our
  server logs errors, without document content. We keep these logs for
  _a period to be set_, then delete them.

## What we do not do

- We do not store your documents. The server keeps no document state.
- We do not use your documents to train models.
- We do not sell or share your data, and we do not track you across sites.
- The viewer sets no cookies and loads nothing from other sites.

## Your choices

- Close the preview, or disable the plugin in your host's settings, at any
  time.
- To ask about or delete data related to you, email the contact address
  below. We answer within _a period to be set_.

## Local installs

If you install the plugin from npm and run it on your computer, documents
never leave your computer.

## Contact

Email docx-editor@eigenpal.com with questions or requests.
