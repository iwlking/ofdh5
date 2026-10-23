import { zipSync, strToU8 } from 'fflate';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../packages/core/test/fixtures');
mkdirSync(outDir, { recursive: true });

const OFD_XML_HEAD = `<?xml version="1.0" encoding="UTF-8"?>
<ofd:OFD xmlns:ofd="http://www.ofdspec.org/2016" DocType="OFD" Version="1.1">`;

function ofdXml(docRoot = 'Doc_0/Document.xml') {
  return `${OFD_XML_HEAD}
  <ofd:DocBody>
    <ofd:DocInfo><ofd:DocID>fixture</ofd:DocID><ofd:Creator>ofdh5</ofd:Creator></ofd:DocInfo>
    <ofd:DocRoot>${docRoot}</ofd:DocRoot>
  </ofd:DocBody>
</ofd:OFD>`;
}

function documentXml(pageCount, width = 210, height = 297) {
  const pages = Array.from({ length: pageCount }, (_, i) =>
    `    <ofd:Page ID="${i + 1}" BaseLoc="Pages/Page_${i}/Content.xml"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:CommonData>
    <ofd:PageArea><ofd:PhysicalBox>0 0 ${width} ${height}</ofd:PhysicalBox></ofd:PageArea>
  </ofd:CommonData>
  <ofd:Pages>
${pages}
  </ofd:Pages>
</ofd:Document>`;
}

function textPage(text, { width = 210, height = 297, size = 5 } = {}) {
  const deltaX = Array.from(text).map(() => size.toFixed(2)).join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:Area><ofd:PhysicalBox>0 0 ${width} ${height}</ofd:PhysicalBox></ofd:Area>
  <ofd:Content><ofd:Layer ID="1">
    <ofd:TextObject ID="2" Boundary="20 30 170 10" Font="9" Size="${size}" CTM="1 0 0 1 0 0" Fill="true" Stroke="false">
      <ofd:FillColor Value="0 0 0"/>
      <ofd:TextCode X="0" Y="${size}" DeltaX="${deltaX}">${text}</ofd:TextCode>
    </ofd:TextObject>
  </ofd:Layer></ofd:Content>
</ofd:Page>`;
}

function write(name, files) {
  const entries = {};
  for (const [path, content] of Object.entries(files)) {
    entries[path] = typeof content === 'string' ? strToU8(content) : content;
  }
  writeFileSync(resolve(outDir, name), zipSync(entries));
  console.log('fixture:', name);
}

// 1. 单页纯文本
write('single-text.ofd', {
  'OFD.xml': ofdXml(),
  'Doc_0/Document.xml': documentXml(1),
  'Doc_0/Pages/Page_0/Content.xml': textPage('ofdh5 单页文本测试'),
});

// 2. 12 页图文混排
{
  const files = { 'OFD.xml': ofdXml(), 'Doc_0/Document.xml': documentXml(12) };
  for (let i = 0; i < 12; i++) {
    files[`Doc_0/Pages/Page_${i}/Content.xml`] = textPage(`第 ${i + 1} 页`);
  }
  write('multi-page.ofd', files);
}

// 3. 矢量表格
write('vector-form.ofd', {
  'OFD.xml': ofdXml(),
  'Doc_0/Document.xml': documentXml(1),
  'Doc_0/Pages/Page_0/Content.xml': `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:Area><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:Area>
  <ofd:Content><ofd:Layer ID="1">
    <ofd:PathObject ID="2" Boundary="20 20 170 60" LineWidth="0.5" Stroke="true" Fill="false">
      <ofd:AbbreviatedData>M 0 0 L 170 0 L 170 60 L 0 60 C</ofd:AbbreviatedData>
      <ofd:StrokeColor Value="0 0 0"/>
    </ofd:PathObject>
    <ofd:PathObject ID="3" Boundary="20 50 170 0.5" LineWidth="0.5" Stroke="true" Fill="false">
      <ofd:AbbreviatedData>M 0 0 L 170 0</ofd:AbbreviatedData>
      <ofd:StrokeColor Value="0 0 0"/>
    </ofd:PathObject>
  </ofd:Layer></ofd:Content>
</ofd:Page>`,
});

// 4. 损坏包：缺 Document.xml
write('broken.ofd', {
  'OFD.xml': ofdXml('Doc_0/Document.xml'),
  'Doc_0/Pages/Page_0/Content.xml': textPage('x'),
});

console.log('fixtures written to', outDir);
