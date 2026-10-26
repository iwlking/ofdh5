#!/usr/bin/env node
/**
 * OFD 结构诊断：扫描包内对象类型与资源，报告渲染器覆盖不到的内容。
 * 用法: node scripts/inspect-ofd.mjs <file.ofd>
 */
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';

const file = process.argv[2];
if (!file) {
  console.error('用法: node scripts/inspect-ofd.mjs <file.ofd>');
  process.exit(1);
}

const zip = unzipSync(new Uint8Array(readFileSync(file)));
const files = new Map(Object.entries(zip).map(([k, v]) => [k.replace(/^\/+/, ''), v]));
const decoder = new TextDecoder('utf-8');
const text = (p) => (files.has(p) ? decoder.decode(files.get(p)) : null);
const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const resolve = (base, rel) => {
  const dir = dirOf(base);
  const joined = rel.startsWith('/') ? rel.slice(1) : dir ? dir + '/' + rel : rel;
  const parts = [];
  for (const seg of joined.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
};

function parseXml(src) {
  // 轻量正则扫描：只需要 localName、属性、文本
  return src;
}

const ofdXml = text('OFD.xml');
if (!ofdXml) { console.error('不是 OFD 包：缺 OFD.xml'); process.exit(2); }
const docRoots = [...ofdXml.matchAll(/<[^>]*DocRoot[^>]*>([^<]+)</g)].map((m) => m[1].trim());
console.log('DocRoot:', docRoots.join(', '));

const findings = { pages: 0, pageSizes: [], objectTypes: {}, publicRes: null, resources: {}, texts: [], issues: [] };

for (const docRoot of docRoots) {
  const docXml = text(docRoot);
  if (!docXml) { findings.issues.push('缺 ' + docRoot); continue; }

  const publicRes = /<[^>]*PublicRes[^>]*>/i.exec(docXml);
  if (publicRes) {
    const baseLoc = /BaseLoc="([^"]+)"/.exec(publicRes[0]);
    const inlineRefs = (publicRes[0].match(/<(\w+:)?(Font|MultiMedia|ColorSpace|DrawParam)\b/g) || []).length;
    findings.publicRes = { inlineRefs, baseLoc: baseLoc ? baseLoc[1] : null };
  }

  const pages = [...docXml.matchAll(/<[^>]*:?Page\s[^>]*BaseLoc="([^"]+)"[^>]*>/g)].map((m) => m[1]);
  findings.pages += pages.length;

  pages.forEach((baseLoc, index) => {
    const loc = resolve(docRoot, baseLoc);
    const content = text(loc);
    if (!content) { findings.issues.push('缺页面 ' + loc); return; }

    const box = /<[^>]*PhysicalBox[^>]*>([^<]+)</.exec(content);
    findings.pageSizes.push(box ? box[1].trim() : 'unknown');

    for (const m of content.matchAll(/<([A-Za-z0-9_]+:)?([A-Z][A-Za-z]+)\s/g)) {
      const name = m[2];
      if (!/Object$|^Layer$|^PageBlock$|^Content$|^Area$|^Resources$|^Fonts$|^MultiMedias$|^ColorSpaces$|^DrawParams$|^TextCode$/.test(name)) continue;
      findings.objectTypes[name] = (findings.objectTypes[name] || 0) + 1;
    }

    const resBlock = /<[^>]*(Resources|PublicRes)[\s\S]*?<\/(\w+:)?(Resources|PublicRes)>/.exec(content);
    if (resBlock) {
      findings.resources.fonts = (findings.resources.fonts || 0) + (resBlock[0].match(/<(\w+:)?Font\b/g) || []).length;
      findings.resources.images = (findings.resources.images || 0) + (resBlock[0].match(/<(\w+:)?MultiMedia\b/g) || []).length;
      findings.resources.colorSpaces = (findings.resources.colorSpaces || 0) + (resBlock[0].match(/<(\w+:)?ColorSpace\b/g) || []).length;
      findings.resources.drawParams = (findings.resources.drawParams || 0) + (resBlock[0].match(/<(\w+:)?DrawParam\b/g) || []).length;
      findings.resources.baseLoc = findings.resources.baseLoc || /<[^>]*Resources[^>]*BaseLoc="([^"]+)"/.exec(content)?.[1] || null;
    }

    for (const m of content.matchAll(/<([A-Za-z0-9_]+:)?TextCode[^>]*>([\s\S]*?)<\//g)) {
      const raw = m[2];
      if (findings.texts.length < 8) findings.texts.push(raw.slice(0, 40));
      if (/[\r\n]/.test(raw)) findings.issues.push('第 ' + (index + 1) + ' 页 TextCode 含换行符');
    }

    if (/<([A-Za-z0-9_]+:)?CompositeObject/.test(content)) findings.issues.push('第 ' + (index + 1) + ' 页使用 CompositeObject');
    if (/<([A-Za-z0-9_]+:)?PageBlock/.test(content)) findings.issues.push('第 ' + (index + 1) + ' 页使用 PageBlock');
    if (/ResourceID="[^"]*"/.test(content) && !/<([A-Za-z0-9_]+:)?MultiMedias/.test(content)) findings.issues.push('第 ' + (index + 1) + ' 页引用资源但本页无 MultiMedias（可能在 PublicRes）');
  });
}

const exts = new Map();
for (const name of files.keys()) {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  if (!m) continue;
  exts.set(m[1].toLowerCase(), (exts.get(m[1].toLowerCase()) || 0) + 1);
}

console.log('页数:', findings.pages);
console.log('页尺寸:', [...new Set(findings.pageSizes)].join(' | '));
console.log('对象统计:', JSON.stringify(findings.objectTypes));
console.log('PublicRes:', JSON.stringify(findings.publicRes));
console.log('页面资源:', JSON.stringify(findings.resources));
console.log('包内文件类型:', JSON.stringify(Object.fromEntries(exts)));
console.log('文本样例:', JSON.stringify(findings.texts));
console.log('--- 风险点');
for (const issue of [...new Set(findings.issues)]) console.log(' !', issue);
