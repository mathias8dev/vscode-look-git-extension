export const SEQUENCE_EDITOR_SCRIPT = `
const fs = require('fs');
const file = process.argv[2];
const actions = new Map(JSON.parse(process.env.LOOK_GIT_REBASE_ACTIONS || '[]'));
const lines = fs.readFileSync(file, 'utf8').split(/\\r?\\n/);
const next = lines.map((line) => {
  const match = line.match(/^([a-z]+)(\\s+)([0-9a-f]+)(\\s.*)$/i);
  if (!match) { return line; }
  const [, , spacing, todoHash, rest] = match;
  for (const [targetHash, action] of actions) {
    if (targetHash.startsWith(todoHash) || todoHash.startsWith(targetHash)) {
      return action + spacing + todoHash + rest;
    }
  }
  return line;
});
fs.writeFileSync(file, next.join('\\n'));
`;

export const MESSAGE_EDITOR_SCRIPT = `
const fs = require('fs');
const file = process.argv[2];
fs.writeFileSync(file, (process.env.LOOK_GIT_COMMIT_MESSAGE || '') + '\\n');
`;
