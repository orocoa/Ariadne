import assert from 'node:assert/strict';
import path from 'node:path';

// Measure the final painted preview before the real card is revealed. This
// catches a doubled border even when ordinary screenshots look identical.
export async function checkCardReturn(page, base, output) {
  const results = [];
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const domain of ['personal', 'job']) {
    const route = domain === 'personal' ? 'personal-information.html' : 'jd.html';
    await page.goto(`${base}/${route}`);
    await page.waitForSelector('.v1-detail-overlay', { state: 'attached' });
    await page.evaluate(async domain => {
      const D = window.JobRadarV1Demo;
      for (let i = 0; i < 10; i++) {
        await D.put(domain === 'personal' ? D.DEMO_STORES.candidates : D.DEMO_STORES.jobs,
          domain === 'personal'
            ? { ...D.clone(D.CANDIDATE_FIXTURES[0]), item_id: `qa-return-${i}`, title: `卡片回收合成资料 ${i}`, copy_locale: 'zh-CN' }
            : { ...D.clone(D.JOB_FIXTURE), job_context_id: `qa-return-${i}`, title: `卡片回收合成职位 ${i}`, copy_locale: 'zh-CN', imported_from: { source_url: 'https://jobs.example.com/qa-return' } });
      }
    }, domain);
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.reload();
      const selector = `[data-transition-key="${domain === 'personal' ? 'candidate' : 'job'}:qa-return-0"]`;
      await page.waitForSelector(selector);
      await page.waitForSelector('.v1-detail-overlay', { state: 'attached' });
      await page.evaluate(() => document.fonts.ready);
      for (const action of ['outside', 'escape', 'early', 'resized']) {
        await page.locator(selector).scrollIntoViewIfNeeded();
        await page.mouse.move(5, 100);
        await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'));
        const before = await page.evaluate(selector => ({
          width: document.body.getBoundingClientRect().width,
          rect: document.querySelector(selector).getBoundingClientRect().toJSON(),
          scroll: scrollY,
        }), selector);
        await page.click(selector);
        if (action !== 'early') {
          await page.waitForFunction(() => {
            const overlay = document.querySelector('.v1-detail-overlay');
            return overlay.classList.contains('is-content-ready') &&
              overlay.querySelector('section').getAnimations().every(a => a.playState !== 'running');
          });
        }
        const during = await page.evaluate(() => document.body.getBoundingClientRect().width);
        assert.equal(during, before.width, 'scroll lock must keep the page width');
        if (action === 'resized') {
          // Exercise the floating-window geometry from which return must start.
          await page.evaluate(() => {
            const surface = document.querySelector('.v1-detail-overlay-surface');
            surface.style.left = '12px'; surface.style.top = '24px';
            surface.style.width = '340px'; surface.style.height = '410px';
          });
        }
        await page.evaluate(selector => {
          window.__cardLanding = null;
          const overlay = document.querySelector('.v1-detail-overlay');
          const surface = overlay.querySelector('section');
          const animate = surface.animate;
          surface.animate = function (...args) {
            const animation = animate.apply(this, args);
            if (overlay.classList.contains('is-closing')) {
              animation.finished.then(() => {
                const source = document.querySelector(selector);
                const preview = overlay.querySelector('.v1-detail-overlay-preview > *');
                window.__cardLanding = {
                  source: source.getBoundingClientRect().toJSON(),
                  preview: preview.getBoundingClientRect().toJSON(),
                  text: source.querySelector('h3').getBoundingClientRect().toJSON(),
                  previewText: preview.querySelector('h3').getBoundingClientRect().toJSON(),
                  sourceShadow: getComputedStyle(source).boxShadow,
                  surfaceShadow: getComputedStyle(surface).boxShadow,
                  width: document.body.getBoundingClientRect().width,
                };
              }).catch(() => {});
            }
            return animation;
          };
          window.__restoreCardProbe = () => { surface.animate = animate; };
        }, selector);
        if (action === 'escape') await page.keyboard.press('Escape');
        else await page.mouse.click(5, 100);
        await page.waitForFunction(() => document.querySelector('.v1-detail-overlay').classList.contains('hidden'));
        const { landing, after } = await page.evaluate(selector => {
          window.__restoreCardProbe();
          const source = document.querySelector(selector);
          return { landing: window.__cardLanding, after: {
            rect: source.getBoundingClientRect().toJSON(), width: document.body.getBoundingClientRect().width,
            scroll: scrollY, focused: document.activeElement === source,
            overflow: document.documentElement.scrollWidth > innerWidth,
          } };
        }, selector);
        assert.ok(landing, 'record the painted landing before handoff');
        for (const property of ['x', 'y', 'width', 'height']) {
          assert.ok(Math.abs(landing.preview[property] - landing.source[property]) < 0.1, `preview ${property} aligns with card`);
          assert.ok(Math.abs(landing.previewText[property] - landing.text[property]) < 0.1, `text ${property} aligns with card`);
          assert.ok(Math.abs(after.rect[property] - landing.source[property]) < 0.1, `handoff preserves ${property}`);
        }
        const normalizeShadow = value => value.replace(/rgba\(0, 0, 0, 0\) 0px 0px 0px 0px/g, '').replace(/[, ]/g, '') || 'none';
        assert.equal(normalizeShadow(landing.surfaceShadow), normalizeShadow(landing.sourceShadow), 'dialog shadow has faded to card shadow');
        assert.equal(after.width, before.width, 'restoring scroll keeps the page width');
        assert.equal(after.scroll, before.scroll, 'return does not scroll the library');
        assert.equal(after.focused, true, 'return restores keyboard focus');
        assert.equal(after.overflow, false, 'no horizontal overflow');
        results.push({ domain, viewport, action, landing, after });
      }
      await page.screenshot({ path: path.join(output, `card-return-${domain}-${viewport.width}.png`) });
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return results;
}
