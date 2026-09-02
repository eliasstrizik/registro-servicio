import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'public');
const output = resolve(root, 'dist');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
await mkdir(resolve(output, 'vendor'), { recursive: true });
await cp(resolve(root, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'), resolve(output, 'vendor/supabase.js'));
console.log('Static site built in dist/');
