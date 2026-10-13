import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    version: string;
    build: { artifactName: string; win: { target: { target: string }[] } };
};

describe('the release workflow', () => {
    it('runs only for a pushed version tag, on Windows, with only the right to publish a release', () => {
        expect(workflow).toMatch(/on:\n {2}push:\n {4}tags:\n {6}- 'v\*'\n/);
        expect(workflow).not.toMatch(/pull_request|branches:/);
        expect(workflow).toMatch(/runs-on: windows-latest/);
        expect(workflow).toMatch(/permissions:\n {2}contents: write\n/);
    });

    it('checks the tag against the version, tests, packages, and attaches the zip the build makes', () => {
        const steps = ['npm ci', 'npm run typecheck', 'npm run lint', 'npm test', 'npm run package'];
        const at = steps.map((step) => workflow.indexOf(`run: ${step}`));
        expect(at.every((index) => index > 0)).toBe(true);
        expect([...at].sort((a, b) => a - b)).toEqual(at);
        expect(workflow).toContain('GITHUB_REF_NAME');
        expect(workflow).toContain('package.json');
        expect(workflow).toMatch(/gh release create "\$GITHUB_REF_NAME" release\/Homeparty-Cards-\*-win\.zip/);
    });

    it('builds without electron-builder trying to publish by itself (the workflow publishes)', () => {
        expect((pkg as unknown as { scripts: Record<string, string> }).scripts.package).toMatch(/--publish never/);
    });

    it('matches what electron-builder writes: a Windows zip named Homeparty-Cards-<version>-win.zip', () => {
        expect(pkg.build.artifactName).toBe('Homeparty-Cards-${version}-${os}.${ext}');
        expect(pkg.build.win.target.map((target) => target.target)).toEqual(['zip']);
        expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
});
