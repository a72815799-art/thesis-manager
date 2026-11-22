import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../src/domain/sha256';

describe('SHA-256 (백업 무결성 해시)', () => {
  it('표준 구현(node:crypto)과 같은 값을 낸다', () => {
    const samples = ['', 'abc', '한글 텍스트 가나다 ①', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), '가'.repeat(5000), JSON.stringify({ a: [1, 2, { b: '근거' }] })];
    for (const s of samples) expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('canonicalJson 은 키 순서와 무관하고 배열 순서는 유지한다', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, 1] } })).toBe(canonicalJson({ a: { c: [3, 1], d: 2 }, b: 1 }));
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
});
