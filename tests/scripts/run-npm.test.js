const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runNpm } = require('../../scripts/run-npm');

describe('npm subprocess execution', () => {
  let root;
  let originalCli;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt skjold npm '));
    originalCli = process.env.npm_execpath;
    process.env.npm_execpath = path.join(root, 'npm cli.js');
  });

  afterEach(() => {
    if (originalCli === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = originalCli;
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('runs a CLI in a path with spaces, preserving arguments, cwd and environment', () => {
    fs.writeFileSync(process.env.npm_execpath, `
      require('node:fs').writeFileSync('result.json', JSON.stringify({
        args: process.argv.slice(2), modelRequired: process.env.NER_MODEL_ASSETS_REQUIRED
      }));
    `);
    const args = ['run', 'build:ext', '--', 'value with spaces', '& echo unexpected', '$(unexpected)'];
    runNpm('fixture', args, { cwd: root, env: { NER_MODEL_ASSETS_REQUIRED: '1' } });
    expect(JSON.parse(fs.readFileSync(path.join(root, 'result.json'), 'utf8'))).toEqual({
      args, modelRequired: '1',
    });
  });

  test('stops validation when the child exits unsuccessfully', () => {
    fs.writeFileSync(process.env.npm_execpath, 'process.exit(7);');
    expect(() => runNpm('failed build', [], { cwd: root })).toThrow('failed build failed with exit code 7');
  });
});
