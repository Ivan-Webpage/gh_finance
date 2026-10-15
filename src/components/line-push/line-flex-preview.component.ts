import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

type FlexNode = Record<string, any>;

/** LINE spacing／margin 關鍵字對應的像素（預覽用，接近 LINE App 實際大小） */
const SPACING: Record<string, number> = { none: 0, xs: 2, sm: 4, md: 8, lg: 12, xl: 16, xxl: 20 };
const TEXT_SIZE: Record<string, number> = { xxs: 10, xs: 11, sm: 13, md: 14, lg: 16, xl: 18, xxl: 22, '3xl': 26, '4xl': 34, '5xl': 46 };
const IMAGE_SIZE: Record<string, string> = {
  xxs: '40px', xs: '60px', sm: '80px', md: '100px', lg: '120px', xl: '140px', xxl: '160px',
  '3xl': '180px', '4xl': '200px', '5xl': '220px', full: '100%',
};
const BUBBLE_WIDTH: Record<string, string> = {
  nano: '120px', micro: '160px', deca: '220px', hecto: '241px', kilo: '260px', mega: '290px', giga: '100%',
};

function px(value: unknown, table: Record<string, number>): string | null {
  if (typeof value !== 'string' || !value) return null;
  if (value in table) return `${table[value]}px`;
  return /^\d+(\.\d+)?(px|%)$/.test(value) ? value : null;
}

/**
 * Flex Message 預覽（簡化版）：支援 bubble／carousel 與 box、text、span、image、button、
 * separator、spacer、filler、icon 等常用元件，版面接近 LINE 實際顯示但不保證完全一致；
 * 正式效果以「測試發送」到手機上看到的為準。
 */
@Component({
  selector: 'app-line-flex-preview',
  templateUrl: './line-flex-preview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class LineFlexPreviewComponent {
  contents = input.required<FlexNode>();

  bubbles = computed<FlexNode[]>(() => {
    const c = this.contents();
    if (c?.type === 'carousel') return Array.isArray(c.contents) ? c.contents : [];
    return c?.type === 'bubble' ? [c] : [];
  });

  isCarousel = computed(() => this.contents()?.type === 'carousel');

  bubbleStyle(bubble: FlexNode): Record<string, string> {
    const width = BUBBLE_WIDTH[bubble.size as string] ?? BUBBLE_WIDTH['mega'];
    return { width: this.isCarousel() ? width : `min(${width}, 100%)`, 'flex-shrink': '0' };
  }

  sectionStyle(bubble: FlexNode, section: string): Record<string, string> {
    const bg = bubble.styles?.[section]?.backgroundColor;
    return bg ? { 'background-color': bg } : {};
  }

  /** header／body／footer 預設內距（LINE 預設 header/body/footer 有 20px 左右內距，hero 沒有） */
  sectionPadding(section: string): Record<string, string> {
    if (section === 'hero') return {};
    return section === 'footer' ? { padding: '10px 14px 14px' } : { padding: '16px 14px' };
  }

  /** 父層 layout 決定子元件怎麼伸展、margin 加在哪一邊 */
  childStyle(node: FlexNode, parentLayout: string, isFirst: boolean, parentSpacing: string | null): Record<string, string> {
    const style: Record<string, string> = {};
    const horizontal = parentLayout === 'horizontal' || parentLayout === 'baseline';
    const flex = node.flex;
    if (horizontal) {
      const grow = typeof flex === 'number' ? flex : node.type === 'box' || node.type === 'text' || node.type === 'filler' || node.type === 'button' || node.type === 'image' ? 1 : 0;
      style['flex'] = grow > 0 ? `${grow} 1 0` : '0 0 auto';
      style['min-width'] = '0';
    } else if (typeof flex === 'number' && flex > 0) {
      style['flex'] = `${flex} 1 0`;
    } else {
      style['flex'] = '0 0 auto';
    }
    // 子元件自己的 margin 優先，沒有就用父層 box 的 spacing（第一個子元件前面不加）
    const margin = px(node.margin, SPACING) ?? px(parentSpacing, SPACING);
    if (margin && !isFirst) {
      style[horizontal ? 'margin-left' : 'margin-top'] = margin;
    }
    if (node.position === 'absolute') {
      style['position'] = 'absolute';
      for (const side of ['top', 'bottom', 'start', 'end']) {
        const v = px(node[`offset${side[0].toUpperCase()}${side.slice(1)}`], SPACING);
        if (v) style[side === 'start' ? 'left' : side === 'end' ? 'right' : side] = v;
      }
    }
    return style;
  }

  boxStyle(node: FlexNode): Record<string, string> {
    const layout = node.layout ?? 'vertical';
    const style: Record<string, string> = {
      display: 'flex',
      'flex-direction': layout === 'vertical' ? 'column' : 'row',
      position: 'relative',
    };
    if (layout === 'baseline') style['align-items'] = 'baseline';
    if (node.backgroundColor) style['background-color'] = node.backgroundColor;
    if (node.background?.type === 'linearGradient') {
      style['background'] = `linear-gradient(${node.background.angle ?? '0deg'}, ${node.background.startColor}, ${node.background.endColor})`;
    }
    const radius = px(node.cornerRadius, SPACING);
    if (radius) style['border-radius'] = radius;
    if (node.borderColor || node.borderWidth) {
      const w = node.borderWidth === 'light' ? '0.5px' : node.borderWidth === 'normal' ? '1px' : node.borderWidth === 'medium' ? '2px' : node.borderWidth === 'semi-bold' ? '3px' : node.borderWidth === 'bold' ? '4px' : (px(node.borderWidth, {}) ?? '1px');
      style['border'] = `${w} solid ${node.borderColor ?? '#000'}`;
    }
    const all = px(node.paddingAll, SPACING);
    if (all) style['padding'] = all;
    for (const [key, css] of [['paddingTop', 'padding-top'], ['paddingBottom', 'padding-bottom'], ['paddingStart', 'padding-left'], ['paddingEnd', 'padding-right']]) {
      const v = px(node[key], SPACING);
      if (v) style[css] = v;
    }
    if (node.width) style['width'] = node.width;
    if (node.height) style['height'] = node.height;
    if (node.maxWidth) style['max-width'] = node.maxWidth;
    if (node.justifyContent) style['justify-content'] = node.justifyContent;
    if (node.alignItems) style['align-items'] = node.alignItems;
    return style;
  }

  textStyle(node: FlexNode): Record<string, string> {
    const style: Record<string, string> = {
      'font-size': px(node.size, TEXT_SIZE) ?? `${TEXT_SIZE['md']}px`,
      color: node.color ?? '#111111',
      'line-height': node.lineSpacing ? `calc(1.3em + ${node.lineSpacing})` : '1.35',
      'white-space': node.wrap ? 'pre-wrap' : 'nowrap',
      overflow: 'hidden',
      'text-overflow': node.wrap ? 'clip' : 'ellipsis',
      'word-break': 'break-word',
    };
    if (node.weight === 'bold') style['font-weight'] = '700';
    if (node.style === 'italic') style['font-style'] = 'italic';
    if (node.decoration === 'underline') style['text-decoration'] = 'underline';
    if (node.decoration === 'line-through') style['text-decoration'] = 'line-through';
    if (node.align === 'center') style['text-align'] = 'center';
    if (node.align === 'end') style['text-align'] = 'right';
    if (node.gravity === 'center') style['align-self'] = 'center';
    if (node.maxLines && node.wrap) {
      style['display'] = '-webkit-box';
      style['-webkit-line-clamp'] = String(node.maxLines);
      style['-webkit-box-orient'] = 'vertical';
    }
    return style;
  }

  spanStyle(node: FlexNode): Record<string, string> {
    const style: Record<string, string> = {};
    if (node.size) style['font-size'] = px(node.size, TEXT_SIZE) ?? '';
    if (node.color) style['color'] = node.color;
    if (node.weight === 'bold') style['font-weight'] = '700';
    if (node.style === 'italic') style['font-style'] = 'italic';
    if (node.decoration && node.decoration !== 'none') style['text-decoration'] = node.decoration;
    return style;
  }

  imageWrapStyle(node: FlexNode): Record<string, string> {
    const size = IMAGE_SIZE[node.size as string] ?? (typeof node.size === 'string' && /^\d+(px|%)$/.test(node.size) ? node.size : IMAGE_SIZE['md']);
    const style: Record<string, string> = { width: '100%', 'max-width': size, display: 'block' };
    style['margin-left'] = node.align === 'start' ? '0' : 'auto';
    style['margin-right'] = node.align === 'end' ? '0' : 'auto';
    const [w, h] = String(node.aspectRatio ?? '1:1').split(':').map(Number);
    if (w > 0 && h > 0) style['aspect-ratio'] = `${w} / ${h}`;
    if (node.backgroundColor) style['background-color'] = node.backgroundColor;
    return style;
  }

  imageFit(node: FlexNode): string {
    return node.aspectMode === 'cover' ? 'cover' : 'contain';
  }

  buttonStyle(node: FlexNode): Record<string, string> {
    const style = node.style ?? 'link';
    const height = node.height === 'sm' ? '34px' : '42px';
    if (style === 'primary') return { background: node.color ?? '#17c950', color: '#fff', height };
    if (style === 'secondary') return { background: node.color ?? '#dcdfe5', color: '#111', height };
    return { background: 'transparent', color: node.color ?? '#42659a', height };
  }

  separatorStyle(node: FlexNode): Record<string, string> {
    return { 'border-top': `1px solid ${node.color ?? '#e5e5e5'}`, width: '100%' };
  }

  spacerStyle(node: FlexNode): Record<string, string> {
    return { height: px(node.size, SPACING) ?? '8px' };
  }

  iconStyle(node: FlexNode): Record<string, string> {
    const size = px(node.size, TEXT_SIZE) ?? `${TEXT_SIZE['md']}px`;
    return { width: size, height: size, 'object-fit': 'contain', 'align-self': 'baseline' };
  }
}
