'use strict';
// Shared by the source-reading tests: drop comments so an assertion about code
// cannot be satisfied (or broken) by a comment.
//
// Line comments go FIRST. The other order let a line comment such as
// "// serves /uploads/* images" open a fake block comment that ran to the next */,
// silently deleting ~105k characters of server.js before any assertion read it.
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

module.exports = { strip };
