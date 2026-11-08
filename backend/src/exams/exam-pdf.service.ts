import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import type { Browser } from 'playwright';

/** 시험지 HTML에서 허용하는 외부 요청: 웹폰트와 문항 그림 저장소(https)만 */
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
const RENDER_TIMEOUT_MS = 30_000;
const MAX_CONCURRENT_RENDERS = 2;

export function examPdfImageHosts(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const hosts = new Set<string>();
  for (const value of [env.SUPABASE_URL, ...(env.EXAM_PDF_IMAGE_HOSTS ?? '').split(',')]) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    try {
      hosts.add(trimmed.includes('://') ? new URL(trimmed).hostname : trimmed);
    } catch {
      // 잘못된 값은 무시
    }
  }
  return hosts;
}

/** 시험지 렌더링 중 나가는 요청을 허용할지 판단한다(그 밖의 요청은 모두 차단). */
export function isAllowedExamPdfRequest(url: string, resourceType: string, imageHosts: ReadonlySet<string>): boolean {
  if (url.startsWith('data:')) return true;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (FONT_HOSTS.has(parsed.hostname)) return resourceType === 'stylesheet' || resourceType === 'font';
  return resourceType === 'image' && imageHosts.has(parsed.hostname);
}

/**
 * 시험지 HTML → PDF (헤드리스 Chromium).
 * 브라우저 인쇄와 같은 엔진이라 화면용 시험지 CSS(@page, 두 단, 명조)가 그대로 PDF가 된다.
 * 사용자가 보낸 HTML을 그리므로 스크립트를 끄고 웹폰트·그림 저장소 외 모든 요청을 막는다.
 */
@Injectable()
export class ExamPdfService implements OnModuleDestroy {
  private readonly logger = new Logger(ExamPdfService.name);
  private browser: Promise<Browser> | null = null;
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  private readonly imageHosts = examPdfImageHosts();

  async render(html: string): Promise<Buffer> {
    await this.acquire();
    try {
      const browser = await this.getBrowser();
      const context = await browser.newContext({ javaScriptEnabled: false });
      try {
        await context.route('**/*', (route) => {
          const request = route.request();
          return isAllowedExamPdfRequest(request.url(), request.resourceType(), this.imageHosts)
            ? route.continue()
            : route.abort();
        });
        const page = await context.newPage();
        await page.setContent(html, { waitUntil: 'networkidle', timeout: RENDER_TIMEOUT_MS });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        return await page.pdf({ preferCSSPageSize: true, printBackground: true });
      } finally {
        await context.close().catch(() => undefined);
      }
    } finally {
      this.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    const browser = await this.browser?.catch(() => null);
    await browser?.close().catch(() => undefined);
  }

  private getBrowser(): Promise<Browser> {
    if (this.browser === null) {
      this.browser = (async () => {
        try {
          const { chromium } = await import('playwright');
          const browser = await chromium.launch();
          browser.on('disconnected', () => {
            this.browser = null;
          });
          return browser;
        } catch (error) {
          this.browser = null;
          this.logger.error(`Chromium 실행 실패: ${error instanceof Error ? error.message : String(error)}`);
          throw new ServiceUnavailableException(
            'PDF 생성 엔진을 실행할 수 없습니다. 서버에 `npx playwright install chromium`이 필요합니다.',
          );
        }
      })();
    }
    return this.browser;
  }

  private async acquire(): Promise<void> {
    if (this.active < MAX_CONCURRENT_RENDERS) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active += 1;
  }

  private release(): void {
    this.active -= 1;
    this.waiting.shift()?.();
  }
}
