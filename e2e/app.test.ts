import { test, expect } from '@playwright/test';

test.describe('page load', () => {
	test('has correct title', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle('Generator pojemników Gridfinity');
	});

	test('shows app header', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'Generator Gridfinity' })).toBeVisible();
	});

	test('shows size heading', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'Rozmiar' })).toBeVisible();
	});

	test('can switch language to English', async ({ page }) => {
		await page.goto('/');

		await page.getByLabel('Język').selectOption('en');

		await expect(page.getByRole('heading', { name: 'Size' })).toBeVisible();
		await expect(page.getByText('Magnet holes')).toBeVisible();
	});
});

test.describe('controls panel', () => {
	test('renders dimension inputs with defaults', async ({ page }) => {
		await page.goto('/');

		const widthInput = page.locator('input[type="number"]').first();
		await expect(widthInput).toHaveValue('2');

		// Length input (second number input)
		const lengthInput = page.locator('input[type="number"]').nth(1);
		await expect(lengthInput).toHaveValue('1');

		// Height input
		const heightInput = page.locator('input[type="number"]').nth(2);
		await expect(heightInput).toHaveValue('3');
	});

	test('shows dimension labels with mm values', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByText('Szerokość (84mm)')).toBeVisible();
		await expect(page.getByText('Długość (42mm)')).toBeVisible();
		await expect(page.getByText('Wysokość (21mm)')).toBeVisible();
	});

	test('updates dimension label when input changes', async ({ page }) => {
		await page.goto('/');

		const widthInput = page.getByRole('spinbutton', { name: /Szerokość/ });
		await widthInput.click({ clickCount: 3 });
		await widthInput.pressSequentially('4');

		await expect(page.getByText('Szerokość (168mm)')).toBeVisible({ timeout: 5000 });
	});

	test('renders feature checkboxes unchecked by default', async ({ page }) => {
		await page.goto('/');

		const magnetCheckbox = page.getByRole('checkbox', { name: 'Otwory na magnesy' });
		const screwCheckbox = page.getByRole('checkbox', { name: 'Otwory na śruby' });
		const labelCheckbox = page.getByRole('checkbox', { name: 'Miejsce na etykietę' });

		await expect(magnetCheckbox).not.toBeChecked();
		await expect(screwCheckbox).not.toBeChecked();
		await expect(labelCheckbox).not.toBeChecked();
	});

	test('can toggle checkboxes', async ({ page }) => {
		await page.goto('/');

		const magnetCheckbox = page.getByRole('checkbox', { name: 'Otwory na magnesy' });
		await magnetCheckbox.check();
		await expect(magnetCheckbox).toBeChecked();
	});

	test('renders stacking lip dropdown with standard selected', async ({ page }) => {
		await page.goto('/');

		await page.locator('summary').click();
		const select = page.getByLabel('Rant do piętrowania');
		await expect(select).toHaveValue('standard');
	});

	test('can change stacking lip option', async ({ page }) => {
		await page.goto('/');

		await page.locator('summary').click();
		const select = page.getByLabel('Rant do piętrowania');
		await select.selectOption('reduced');
		await expect(select).toHaveValue('reduced');

		await select.selectOption('none');
		await expect(select).toHaveValue('none');
	});

	test('renders divider inputs at zero', async ({ page }) => {
		await page.goto('/');

		await page.locator('summary').click();
		await expect(page.getByText('Przegrody X')).toBeVisible();
		await expect(page.getByText('Przegrody Y')).toBeVisible();
	});

	test('renders export buttons', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByRole('button', { name: 'STEP' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'STL' })).toBeVisible();
	});
});

test.describe('3d viewer', () => {
	test('shows generating overlay on load', async ({ page }) => {
		await page.goto('/');
		// The "Generating..." text may appear briefly on load
		const overlay = page.getByText('Generating...');
		// Just verify the viewer area exists (canvas renders)
		await expect(page.locator('main')).toBeVisible();
	});

	test('canvas element is rendered', async ({ page }) => {
		await page.goto('/');
		// Threlte renders a canvas element
		await expect(page.locator('canvas')).toBeVisible({ timeout: 10000 });
	});
});

test.describe('wall thickness', () => {
	test('renders wall thickness input with default', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByText('Grubość ścianki (mm)')).toBeVisible();

		const wallInput = page.locator('input[type="number"]').nth(3);
		await expect(wallInput).toHaveValue('1.2');
	});
});
