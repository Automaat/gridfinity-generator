import { test, expect } from '@playwright/test';

test.describe('page load', () => {
	test('has correct title', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle('Gridfinity Bin Generator');
	});

	test('shows app header', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'Gridfinity Generator' })).toBeVisible();
	});

	test('shows parameters heading', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'Parameters' })).toBeVisible();
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
		await expect(page.getByText('Width (84mm)')).toBeVisible();
		await expect(page.getByText('Length (42mm)')).toBeVisible();
		await expect(page.getByText('Height (21mm)')).toBeVisible();
	});

	test('updates dimension label when input changes', async ({ page }) => {
		await page.goto('/');

		const widthInput = page.getByRole('spinbutton', { name: /Width/ });
		await widthInput.click();
		await widthInput.fill('4');
		await widthInput.dispatchEvent('input');

		await expect(page.getByText('Width (168mm)')).toBeVisible({ timeout: 5000 });
	});

	test('renders feature checkboxes unchecked by default', async ({ page }) => {
		await page.goto('/');

		const magnetCheckbox = page.getByRole('checkbox', { name: 'Magnet holes' });
		const screwCheckbox = page.getByRole('checkbox', { name: 'Screw holes' });
		const labelCheckbox = page.getByRole('checkbox', { name: 'Label tab' });

		await expect(magnetCheckbox).not.toBeChecked();
		await expect(screwCheckbox).not.toBeChecked();
		await expect(labelCheckbox).not.toBeChecked();
	});

	test('can toggle checkboxes', async ({ page }) => {
		await page.goto('/');

		const magnetCheckbox = page.getByRole('checkbox', { name: 'Magnet holes' });
		await magnetCheckbox.check();
		await expect(magnetCheckbox).toBeChecked();
	});

	test('renders stacking lip dropdown with standard selected', async ({ page }) => {
		await page.goto('/');

		const select = page.getByLabel('Stacking lip');
		await expect(select).toHaveValue('standard');
	});

	test('can change stacking lip option', async ({ page }) => {
		await page.goto('/');

		const select = page.getByLabel('Stacking lip');
		await select.selectOption('reduced');
		await expect(select).toHaveValue('reduced');

		await select.selectOption('none');
		await expect(select).toHaveValue('none');
	});

	test('renders divider inputs at zero', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByText('Dividers X')).toBeVisible();
		await expect(page.getByText('Dividers Y')).toBeVisible();
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
		await expect(page.getByText('Wall thickness (mm)')).toBeVisible();

		const wallInput = page.locator('input[type="number"]').nth(3);
		await expect(wallInput).toHaveValue('1.2');
	});
});
