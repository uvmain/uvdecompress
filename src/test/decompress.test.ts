import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, it } from 'node:test'
import { decompress } from '../index.js'

let __dirname = path.dirname(new URL(import.meta.url).pathname)
if (process.platform === 'win32' && __dirname.startsWith('/')) {
  __dirname = __dirname.slice(1)
}
const fixturesDir = path.resolve(__dirname, '../../', 'fixtures')

async function getBufferFromFixtureFile(filePath: string): Promise<Buffer> {
  const fullPath = path.join(fixturesDir, filePath)
  return fs.promises.readFile(fullPath)
}

describe('decompress', () => {
  it('throw on wrong input', async () => {
    // @ts-expect-error intentionally passing a non-Buffer/string value
    await assert.rejects(() => decompress(123), {
      name: 'TypeError',
      message: 'Input must be a Buffer or a file path string',
    })

    // @ts-expect-error intentionally passing a non-Buffer/string value
    await assert.rejects(() => decompress(null), {
      name: 'TypeError',
      message: 'Input must be a Buffer or a file path string',
    })
  })

  it('return empty array if non-valid file is supplied', async () => {
    const result = await decompress(Buffer.from('this is not an archive'))
    assert.deepStrictEqual(result, [])
  })

  it('extract tar.gz with symlink', async () => {
    const buffer = await getBufferFromFixtureFile('symlink.tar.gz')
    const result = await decompress(buffer)
    const symlink = result.find(file => file.type === 'symlink' && file.path === 'test.symlink.txt')
    assert.ok(symlink, 'should contain a symlink entry')
    assert.strictEqual(symlink.linkTarget, 'test.txt')
  })

  it('extract zip with symlink', async () => {
    const buffer = await getBufferFromFixtureFile('symlink.zip')
    const result = await decompress(buffer)
    const symlink = result.find(file => file.type === 'symlink' && file.path === 'test.symlink.txt')
    assert.ok(symlink, 'should contain a symlink entry')
    assert.strictEqual(symlink.linkTarget, 'test.txt')
  })

  it('extract single file from tar.gz', async () => {
    const buffer = await getBufferFromFixtureFile('single-file.tar.gz')
    const result = await decompress(buffer)
    const file = result.find(file => file.type === 'file' && file.path === 'test.txt')
    assert.ok(file)
    assert.strictEqual(file.data.toString(), 'this is a test\n')
  })

  it('extract single file from zip', async () => {
    const buffer = await getBufferFromFixtureFile('single-file.zip')
    const result = await decompress(buffer)
    const file = result.find(file => file.type === 'file' && file.path === 'test.txt')
    assert.ok(file)
    assert.strictEqual(file.data.toString(), 'this is a test\n')
  })

  it('extract single file from gz', async () => {
    const buffer = await getBufferFromFixtureFile('test.txt.gz')
    const result = await decompress(buffer)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].data.toString(), 'this is a test\n')
  })

  it('extract multiple files from tar.gz', async () => {
    const buffer = await getBufferFromFixtureFile('multiple-files.tar.gz')

    // Verify the buffer starts with gzip magic bytes
    assert.strictEqual(buffer[0], 0x1F)
    assert.strictEqual(buffer[1], 0x8B)

    const result = await decompress(buffer)
    const files = result.filter(f => f.type === 'file')

    assert.ok(files.length === 2, `expected 2 files, got ${files.length}`)
    assert.strictEqual(
      files.find(f => f.path === 'test.txt')?.data.toString(),
      'this is a test\n',
    )
    assert.strictEqual(
      files.find(f => f.path === 'test2.txt')?.data.toString(),
      'this is a test\n',
    )
  })

  it('extract multiple files from zip', async () => {
    const buffer = await getBufferFromFixtureFile('multiple-files.zip')

    // Verify the buffer starts with zip magic bytes
    assert.strictEqual(buffer[0], 0x50)
    assert.strictEqual(buffer[1], 0x4B)

    const result = await decompress(buffer)
    const files = result.filter(f => f.type === 'file')

    assert.ok(files.length === 2, `expected 2 files, got ${files.length}`)
    assert.strictEqual(
      files.find(f => f.path === 'test.txt')?.data.toString(),
      'this is a test\n',
    )
    assert.strictEqual(
      files.find(f => f.path === 'test2.txt')?.data.toString(),
      'this is a test\n',
    )
  })

  it('filter results with options.filter', async () => {
    const zipBuffer = await getBufferFromFixtureFile('multiple-files.zip')
    const zipResult = await decompress(zipBuffer, {
      filter: file => file.path === 'test2.txt',
    })

    assert.strictEqual(zipResult.length, 1)

    // no filter — returns everything
    const allResult = await decompress(zipBuffer)
    assert.strictEqual(allResult.length, 2)
  })

  it('accept a file path string as input', async () => {
    const zipPath = path.join(fixturesDir, 'multiple-files.zip')
    const result = await decompress(zipPath)
    const files = result.filter(file => file.type === 'file')
    assert.strictEqual(files.length, 2)
    assert.strictEqual(
      files.find(f => f.path === 'test.txt')?.data.toString(),
      'this is a test\n',
    )
    assert.strictEqual(
      files.find(f => f.path === 'test2.txt')?.data.toString(),
      'this is a test\n',
    )

    // Also works with options.filter
    const filtered = await decompress(zipPath, {
      filter: file => file.path === 'test2.txt',
    })
    assert.strictEqual(filtered.length, 1)
    assert.strictEqual(filtered[0].path, 'test2.txt')
  })
})
