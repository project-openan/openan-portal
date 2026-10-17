// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const safeFile = value => typeof value === 'string' && /^[A-Za-z0-9_.-]+$/.test(value) && value !== '..';
const assetExtensions = new Set(['.js', '.mjs', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.wasm', '.txt', '.map']);

async function artifactFiles(directory, prefix = '') {
    const files = [];
    for (const entry of await fs.readdir(path.join(directory, prefix), { withFileTypes: true })) {
        if (!safeFile(entry.name) || entry.name.startsWith('.') || entry.isSymbolicLink()) {
            throw new Error(`Unsafe artifact path: ${path.posix.join(prefix, entry.name)}`);
        }
        const relative = path.posix.join(prefix, entry.name);
        if (entry.isDirectory()) files.push(...await artifactFiles(directory, relative));
        else if (entry.isFile() && assetExtensions.has(path.extname(entry.name).toLowerCase())) files.push(relative);
        else throw new Error(`Unsupported artifact file: ${relative}`);
    }
    return files.sort();
}

export async function inspectArtifact(directory, id) {
    const manifest = JSON.parse(await fs.readFile(path.join(directory, 'plugin.manifest.json'), 'utf8'));
    if (manifest.id !== id || !manifest.name || !manifest.version || !manifest.routes?.length ||
        manifest.routes.some(route => typeof route.path !== 'string' || !route.path.startsWith('/'))) {
        throw new Error(`${id}: invalid plugin manifest`);
    }
    const entry = manifest.entry || 'index.js';
    const required = [entry, ...(manifest.css ? [manifest.css] : [])];
    if (required.some(file => !safeFile(file))) throw new Error(`${id}: unsafe artifact filename`);
    const allFiles = await artifactFiles(directory);
    if (required.some(file => !allFiles.includes(file))) throw new Error(`${id}: missing required artifact`);
    const sha256 = {};
    for (const file of allFiles) {
        const bytes = await fs.readFile(path.join(directory, file));
        if (!bytes.length) throw new Error(`${id}: empty ${file}`);
        if (file === entry && !bytes.toString().includes(`__OPENAN_PLUGIN__${id.replaceAll('-', '_')}`)) {
            throw new Error(`${id}: missing UMD global`);
        }
        sha256[file] = createHash('sha256').update(bytes).digest('hex');
    }
    return { manifest, files: allFiles.filter(file => file !== 'plugin.manifest.json'), sha256 };
}

async function assertNoSymlinks(directory, relative = '') {
    let current = directory;
    for (const part of ['', ...relative.split('/').filter(Boolean)]) {
        current = path.join(current, part);
        try {
            if ((await fs.lstat(current)).isSymbolicLink()) throw new Error(`Unsafe artifact destination: ${current}`);
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
}

export async function installArtifact(directory, id, root = workspace) {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid plugin id');
    directory = path.resolve(directory);
    const inspected = await inspectArtifact(directory, id);
    const destination = path.join(root, 'portal/public/plugins', id);
    if (directory === destination) return inspected;
    for (const file of ['plugin.manifest.json', ...inspected.files]) {
        // Walk from root, including existing parent directories, before writing.
        await assertNoSymlinks(root, path.relative(root, path.join(destination, file)).split(path.sep).join('/'));
    }
    for (const file of ['plugin.manifest.json', ...inspected.files]) {
        const target = path.join(destination, file);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(path.join(directory, file), target);
    }
    return inspected;
}

export async function validateArtifacts(root = workspace) {
    const registry = JSON.parse(await fs.readFile(path.join(root, 'portal/bundled-plugins.json'), 'utf8'));
    const records = [];
    for (const plugin of registry.filter(plugin => plugin.enabled !== false)) {
        if (!/^[a-z0-9-]+$/.test(plugin.id) || plugin.entry !== `/plugins/${plugin.id}`) {
            throw new Error(`${plugin.id}: release validation requires local /plugins/<id> artifacts; remote delivery must be verified separately`);
        }
        const { manifest, sha256 } = await inspectArtifact(path.join(root, 'portal/public', plugin.entry), plugin.id);
        records.push({ id: plugin.id, version: manifest.version, sha256 });
    }
    return records;
}

async function main() {
    if (process.argv[2] === 'install') {
        const args = process.argv.slice(3);
        if (!args.length) throw new Error('Usage: npm run plugins:install -- <plugin-id>=<dist-plugin-directory> [...]');
        for (const arg of args) {
            const index = arg.indexOf('=');
            if (index < 1) throw new Error('Expected plugin-id=directory');
            const id = arg.slice(0, index);
            const directory = path.resolve(arg.slice(index + 1));
            await installArtifact(directory, id);
            console.log(`Installed ${id}`);
        }
    } else {
        const records = await validateArtifacts();
        await fs.mkdir(path.join(workspace, 'portal/public'), { recursive: true });
        await fs.writeFile(path.join(workspace, 'portal/public/plugins.release.json'), JSON.stringify(records, null, 2) + '\n');
        await fs.writeFile(path.join(workspace, 'portal/public/plugins.enabled'), records.map(record => record.id).join('\n') + '\n');
        console.log(`Validated ${records.length} plugin artifacts`);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
