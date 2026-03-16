import { expect, test, type Page } from '@playwright/test';

const waitForPosterCount = async (page: Page, minimum = 1) => {
  const shell = page.getByTestId('app-shell');
  await expect
    .poll(async () => Number(await shell.getAttribute('data-poster-count') || '0'))
    .toBeGreaterThanOrEqual(minimum);
};

const dispatchTvKey = async (page: Page, key: string) => {
  await page.evaluate((nextKey) => {
    const target = (document.activeElement as HTMLElement | null) ?? document.body;
    const keyCodeMap: Record<string, number> = {
      Escape: 27,
      ArrowRight: 22,
      ArrowLeft: 21,
      ArrowUp: 19,
      ArrowDown: 20,
      Enter: 13
    };
    const keyCode = keyCodeMap[nextKey] ?? 0;
    const dispatch = (type: 'keydown' | 'keyup') => {
      target.dispatchEvent(new KeyboardEvent(type, {
        key: nextKey,
        code: nextKey,
        keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true
      }));
    };
    dispatch('keydown');
    dispatch('keyup');
  }, key);
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
});

test('launches into the default movies corridor with content', async ({ page }) => {
  await page.goto('/');

  const shell = page.getByTestId('app-shell');
  await expect(shell).toBeVisible();
  await expect
    .poll(async () => await shell.getAttribute('data-active-section'))
    .toBe('all');

  await waitForPosterCount(page, 1);
  await expect(page.getByText('נסה שוב')).toHaveCount(0);
});

test('switches root datasets and applies movie subcategories deterministically', async ({ page }) => {
  await page.goto('/');

  const shell = page.getByTestId('app-shell');
  const initialRootKey = await shell.getAttribute('data-root-request-key');

  await page.getByTestId('menu-root-series').click({ force: true });
  await expect.poll(async () => await shell.getAttribute('data-active-section')).toBe('series');
  await waitForPosterCount(page, 1);
  await expect.poll(async () => await shell.getAttribute('data-root-request-key')).not.toBe(initialRootKey);

  await page.getByTestId('menu-root-israeli').click();
  await expect.poll(async () => await shell.getAttribute('data-active-section')).toBe('israeli');
  await waitForPosterCount(page, 1);

  await dispatchTvKey(page, 'Escape');
  await expect.poll(async () => await shell.getAttribute('data-sidebar-open')).toBe('true');

  const moviesRoot = page.getByTestId('menu-root-movies');
  await moviesRoot.focus();
  await dispatchTvKey(page, 'ArrowRight');
  await expect(page.getByTestId('menu-subgroup-movies-categories')).toBeVisible();
  await page.getByTestId('menu-item-movies-top-rated').evaluate((element: HTMLButtonElement) => {
    element.click();
  });

  await expect.poll(async () => await shell.getAttribute('data-active-section')).toBe('all');
  await expect.poll(async () => await shell.getAttribute('data-active-item-id')).toBe('movies-top-rated');
  await expect.poll(async () => await shell.getAttribute('data-sidebar-open')).toBe('false');
});

test('search accepts input and back reopens/closes the sidebar correctly', async ({ page }) => {
  await page.goto('/');

  const shell = page.getByTestId('app-shell');
  await page.getByTestId('menu-root-search').click({ force: true });

  await expect.poll(async () => await shell.getAttribute('data-search-open')).toBe('true');
  const searchInput = page.getByTestId('search-input');
  await expect(searchInput).toBeVisible();
  await searchInput.fill('matrix');
  await expect(page.getByText(/matrix/i).first()).toBeVisible();

  await dispatchTvKey(page, 'Escape');
  await expect.poll(async () => await shell.getAttribute('data-search-open')).toBe('false');
  await expect.poll(async () => await shell.getAttribute('data-sidebar-open')).toBe('true');

  await dispatchTvKey(page, 'Escape');
  await expect.poll(async () => await shell.getAttribute('data-sidebar-open')).toBe('false');
});
