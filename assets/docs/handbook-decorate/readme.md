
# Word 手册装饰风生成

把一份偏文字的 docx（如科普知识手册）改造成手绘卡通风、图文并茂的装饰版，是社区科普 / 亲子活动 / 研学场景的高频需求。本技能给出一套**稳定、可复现**的 python-docx 工作流，覆盖「素材准备 → 版式美化 → 海报插入 → 校验」四步。

## 设计原则（交付前先和用户对齐）

1. **优先段落级装饰，慎用整页背景水印**。Word 的整页背景水印需要直接改 OOXML header 的 anchor，极易与正文重叠、且不同版本渲染不一致。更稳、更"简约"的做法是：段落底纹（`w:shd`）+ 段首/段尾 inline 图标 + 海报插图。若用户强要"整页铺满背景"，直接改用 HTML/PDF 方案（见结尾备选）。
2. **Icon 化、少大段文字、口语化**：标题前放图标，正文保留但调小行距，避免晦涩学术名词。
3. **保留原文字完整性**：装饰只增不改，不删原内容，仅统一字体/配色/间距。
4. **配图位置标注**：用户尚未给图但要求预留位置处，用文字"配图示意：xxx"占位。

## 环境准备

```bash
# 用托管 python venv（已装 python-docx / Pillow）
PY="$HOME/.workbuddy/binaries/python/envs/default/Scripts/python.exe"
"$PY" -c "import docx, PIL; print('ok')"   # 缺则: $PY -m pip install python-docx Pillow
```

> 注意：本技能用 **python-docx**，不是 python-pptx。`paragraph.add_run(text)` 在 docx 下可直接传字符串；而 python-pptx 的 `add_run` 不接受文本参数（那是 pptx 的坑，别混）。

## 工作流

### 步骤 1 — 读取原文档结构

先用脚本把文段落、表格、章节、关键标题枚举出来，确认要美化的"锚点"（大标题、章节、Tip、提问、来源等）的确切文字，便于后续按文本匹配。

```bash
"$PY" - <<'PY'
from docx import Document
doc = Document(r"源文件.docx")
for i, p in enumerate(doc.paragraphs[:120], 1):
    t = p.text.strip()
    if t:
        print(f"{i:03d} [{p.style.name}] {t}")
PY
```

记录规律，例如：`科普知识手册-前言`（大标题）、`1.产品定位`（前言编号标题）、`科普小知识`/`🌿自然科学板块`（大节）、`Tip1 xxx`（Tip 标题）、`🙋小提问`（提问）、`📌科普小 tip`（答案）、`🔍来源`（来源）。

### 步骤 2 — 素材准备（webp/gif → png + 水印版）

docx 对 webp/gif 兼容性差，先统一转 PNG（保留透明 RGBA）；GIF 取第一帧；海报保持原分辨率。再生成一批**半透明水印版**备用（轻量角标）。模板见 `templates/prepare_assets.py`，核心是：

```python
from PIL import Image
img = Image.open(src)
if getattr(img, "is_animated", False): img.seek(0)
img = img.convert("RGBA")
img.save(dst, "PNG")
# 水印版
img.putalpha(55)   # 降低透明度
```

### 步骤 3 — 段落级美化（核心）

`templates/decorate.py` 提供了完整可改模板。关键工具函数：

```python
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

def set_paragraph_shading(para, hex_fill):
    """段落底纹（浅色块背景）。"""
    pPr = para._p.get_or_add_pPr()
    shd = OxmlElement('w:shd'); shd.set(qn('w:val'), 'clear'); shd.set(qn('w:fill'), hex_fill)
    pPr.append(shd)

def set_run_font(run, name='微软雅黑', size=11, bold=False, italic=False, color=None):
    run.font.name = name; run.font.size = Pt(size); run.font.bold = bold
    if color: run.font.color.rgb = color
    # 中文必须设 eastAsia，否则中文字体不生效
    rPr = run._r.get_or_add_rPr(); rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn('w:eastAsia'), name)

def prepend_inline_image(para, img_path, width_inch=0.6):
    """在段落最前面插入 inline 图片（图标）。"""
    new_run = para._p.add_run()
    new_run.add_picture(img_path, width=Inches(width_inch))
    para._p.insert(0, new_run)   # 移到段首
```

按文本匹配逐段套样式：

| 段落类型 | 处理 | 配色 |
|---------|------|------|
| 大标题 | 橘猫 IP 图 + 居中加粗 | 深蓝 `#1E5AA8` |
| 前言编号标题 | 加粗放蓝 | 深蓝 |
| 大节标题 | 选图标（小知识→星星人/板块→花植）+ 浅黄底纹 `#FFF8E1` | 深蓝 |
| Tip 标题 | 灯泡图标 + 浅蓝底纹 `#E8F4FC` | 科普蓝 `#257AC7` |
| 小提问 | 紫色对话框图标 + 紫色文字 `#5E35A8` | — |
| 科普小 tip | 加粗蓝字 | 科普蓝 |
| 来源 | 右对齐斜体灰字 + 末尾小星星 | 灰 `#666` |

### 步骤 4 — 插入海报

在指定 Tip 的「来源」段落后插入居中标题 + 海报图（宽度约 5.2 英寸）。用底层 XML `addnext` 插入新段落以避免破坏列表：

```python
def add_poster_after(doc, anchor_idx, poster_path, caption):
    anchor = doc.paragraphs[anchor_idx]
    new_p = OxmlElement('w:p'); anchor._p.addnext(new_p)
    cap = type(anchor)(new_p, anchor._parent); cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.add_run(caption)                       # 图注
    new_p2 = OxmlElement('w:p'); cap._p.addnext(new_p2)
    img = type(anchor)(new_p2, anchor._parent); img.alignment = WD_ALIGN_PARAGRAPH.CENTER
    img.add_run().add_picture(poster_path, width=Inches(5.2))
```

### 步骤 5 — 校验

```bash
"$PY" - <<'PY'
from docx import Document
d = Document("输出.docx")
print("段落", len(d.paragraphs), "图片rels",
      sum(1 for r in d.part.rels.values() if 'image' in r.target_ref))
full = "\n".join(p.text for p in d.paragraphs)
for k in ["科普知识手册-前言","Tip9","蜂蜜"]:
    print(k, "✓" if k in full else "✗")
PY
```

确认：文档能打开、图片数 = 装饰数 + 海报数、关键文字齐全、无乱码。

## 推荐配色（科普蓝亲子风）

```
深蓝标题   #1E5AA8
科普蓝 Tip #257AC7
正文深灰   #333333
来源灰     #666666
浅蓝底纹   #E8F4FC
浅黄底纹   #FFF8E1
紫色提问   #5E35A8
```

## 常见坑

- **webp/gif 不进 docx**：必须转 PNG。GIF 不转会丢帧或报错。
- **中文字体不生效**：只设 `font.name` 不够，必须给 run 的 `rPr/rFonts` 设 `w:eastAsia`。
- **装饰素材过大会撑大 docx**：装饰图标最大边限制在 120–160px；海报才保留原分辨率。
- **段落底纹 vs 整页背景**：优先用底纹，整页水印易重叠且跨版本不稳。
- **海报插入位置**：按"来源"段索引定位，注意前面样式改动不改变段落数组索引，可安全用原始索引。
- **新增内容（如 Tip9）**：用 `last._p.addnext(new_p)` + `type(anchor)(new_p, parent)` 构造新段落对象，比 `doc.add_paragraph()` 更可控。

## 备选：要"整页背景 / 漂浮元素"时用 HTML

若用户要的是真正铺满页面的背景 + 任意漂浮装饰，直接做 **单文件 HTML**（CSS fixed background + absolute 漂浮元素 + 打印转 PDF），视觉冲击力远强于 docx。docx 只适合"图文排版式"手册。

## 交付物

- `XXX_装饰版.docx`（不覆盖原文件）
- 可选：素材目录 `assets/`（已转 PNG）、`watermark/`（轻透版）
- 校验报告（段落数 / 图片数 / 关键文字）
