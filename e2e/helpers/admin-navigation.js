// Reveal only the group containing the existing route; legacy content tests still use real clicks.
export async function adminNavigation(page, selector) {
  const item = page.locator(selector)
  const menu = page.locator('#admin-menu')
  if (await menu.isVisible() && await menu.getAttribute('aria-expanded') !== 'true') await menu.click()
  const group = item.locator('xpath=ancestor::details[contains(@class,"admin-nav-group")][1]')
  if (await group.count() && !await group.evaluate(node => node.open)) await group.locator(':scope > summary').click()
  await item.scrollIntoViewIfNeeded()
  return item
}

export async function adminField(form, selector) {
  const field = form.locator(selector)
  const group = field.locator('xpath=ancestor::details[1]')
  if (await group.count() && !await group.evaluate(node => node.open)) await group.locator(':scope > summary').click()
  return field
}
