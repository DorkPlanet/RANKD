import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";

import { looksLikeZip, readFromZip, wantRatingsCsv } from "@/lib/zip";

// ── Fixtures are real zips, byte for byte ──────────────────────────────────
//
// Built here rather than checked in, and built to the spec rather than by
// recording what the reader already does — a fixture produced by the code under
// test proves only that it is self-consistent. Node's `deflateRawSync` supplies
// the compressed bytes, which is the one part worth not writing by hand.

const te = new TextEncoder();

function makeZip(files: { name: string; body: string; store?: boolean }[]): ArrayBuffer {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = te.encode(f.name);
    const bodyBytes = te.encode(f.body);
    const data = f.store ? bodyBytes : new Uint8Array(deflateRawSync(Buffer.from(bodyBytes)));
    const method = f.store ? 0 : 8;

    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, bodyBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, bodyBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const l of locals) {
    out.set(l, at);
    at += l.length;
  }
  for (const c of centrals) {
    out.set(c, at);
    at += c.length;
  }
  out.set(eocd, at);
  return out.buffer;
}

const CSV = 'Date,Name,Year,Letterboxd URI,Rating\n2024-01-01,"Lock, Stock",1998,x,4.5\n';

describe("looksLikeZip", () => {
  it("recognises a zip by its first four bytes, not its name", () => {
    expect(looksLikeZip(new Uint8Array(makeZip([{ name: "a.csv", body: "x" }])))).toBe(true);
  });

  it("says no to a csv", () => {
    expect(looksLikeZip(te.encode(CSV))).toBe(false);
  });

  it("says no to something too short to judge", () => {
    expect(looksLikeZip(new Uint8Array([0x50, 0x4b]))).toBe(false);
  });
});

describe("readFromZip", () => {
  it("pulls a deflated ratings.csv out whole", async () => {
    const zip = makeZip([{ name: "ratings.csv", body: CSV }]);
    expect(await readFromZip(zip, wantRatingsCsv)).toBe(CSV);
  });

  it("handles a stored entry too", async () => {
    const zip = makeZip([{ name: "ratings.csv", body: CSV, store: true }]);
    expect(await readFromZip(zip, wantRatingsCsv)).toBe(CSV);
  });

  // A Letterboxd export nests everything one directory deep, which is exactly
  // the shape a naive "name === 'ratings.csv'" check misses.
  it("finds it inside a folder", async () => {
    const zip = makeZip([{ name: "letterboxd-someone-2024/ratings.csv", body: CSV }]);
    expect(await readFromZip(zip, wantRatingsCsv)).toBe(CSV);
  });

  it("picks the right file out of a real-looking export", async () => {
    const zip = makeZip([
      { name: "export/profile.csv", body: "not this" },
      { name: "export/watched.csv", body: "nor this" },
      { name: "export/ratings.csv", body: CSV },
      { name: "export/reviews.csv", body: "definitely not" },
    ]);
    expect(await readFromZip(zip, wantRatingsCsv)).toBe(CSV);
  });

  it("survives a zip comment, which moves the record it scans for", async () => {
    const base = new Uint8Array(makeZip([{ name: "ratings.csv", body: CSV }]));
    const comment = te.encode("packed by something chatty");
    const withComment = new Uint8Array(base.length + comment.length);
    withComment.set(base);
    withComment.set(comment, base.length);
    new DataView(withComment.buffer).setUint16(base.length - 2, comment.length, true);
    expect(await readFromZip(withComment.buffer, wantRatingsCsv)).toBe(CSV);
  });

  // Every failure has the same fallback -- ask for the csv instead -- so none of
  // them may throw.
  it("returns null when the archive has no ratings file", async () => {
    const zip = makeZip([{ name: "diary.csv", body: "x" }]);
    expect(await readFromZip(zip, wantRatingsCsv)).toBeNull();
  });

  it("returns null for something that is not a zip at all", async () => {
    expect(await readFromZip(te.encode(CSV).buffer as ArrayBuffer, wantRatingsCsv)).toBeNull();
  });

  it("returns null for a truncated archive rather than throwing", async () => {
    const zip = makeZip([{ name: "ratings.csv", body: CSV }]);
    expect(await readFromZip(zip.slice(0, 40), wantRatingsCsv)).toBeNull();
  });

  it("returns null for a compression method it does not support", async () => {
    const zip = makeZip([{ name: "ratings.csv", body: CSV }]);
    // 14 is LZMA. Patch both headers so the central directory and the local one
    // agree, the way a real archive from another tool would.
    const v = new DataView(zip);
    v.setUint16(8, 14, true);
    const eocdAt = zip.byteLength - 22;
    v.setUint16(new DataView(zip).getUint32(eocdAt + 16, true) + 10, 14, true);
    expect(await readFromZip(zip, wantRatingsCsv)).toBeNull();
  });
});
