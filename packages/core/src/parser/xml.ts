import { OfdError } from '../errors';

export function parseXml(source: string, label: string): Document {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(source, 'application/xml');
  } catch (error) {
    throw new OfdError('E_PARSE_XML', `${label} 解析失败：${(error as Error).message}`);
  }
  const errors = doc.getElementsByTagName('parsererror');
  if (errors.length > 0) {
    const detail = (errors[0].textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
    throw new OfdError('E_PARSE_XML', `${label} 解析失败：${detail}`);
  }
  return doc;
}

export function firstByLocalName(root: Element | Document, localName: string): Element | null {
  const list = root.getElementsByTagName('*');
  for (let i = 0; i < list.length; i++) {
    if (list[i].localName === localName) return list[i];
  }
  return null;
}

export function allByLocalName(root: Element | Document, localName: string): Element[] {
  const out: Element[] = [];
  const list = root.getElementsByTagName('*');
  for (let i = 0; i < list.length; i++) {
    if (list[i].localName === localName) out.push(list[i]);
  }
  return out;
}

export function directChild(element: Element, localName: string): Element | null {
  const children = element.children;
  for (let i = 0; i < children.length; i++) {
    if (children[i].localName === localName) return children[i];
  }
  return null;
}

export function attr(element: Element | null, name: string): string | null {
  if (!element) return null;
  if (element.hasAttribute(name)) return element.getAttribute(name);
  const attributes = element.attributes;
  for (let i = 0; i < attributes.length; i++) {
    if (attributes[i].localName === name) return attributes[i].value;
  }
  return null;
}

export function num(value: string | null, fallback = 0): number {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function nums(value: string | null): number[] {
  if (!value) return [];
  return value
    .trim()
    .split(/\s+/)
    .map((item) => Number.parseFloat(item))
    .filter((item) => Number.isFinite(item));
}
