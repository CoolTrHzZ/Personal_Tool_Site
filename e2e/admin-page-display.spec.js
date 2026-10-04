import { test, expect } from '@playwright/test'
import { mockAdmin } from './helpers/admin-mock.js'
import { DISPLAY_PAGES } from '../shared/page-display.js'

for (const width of [1280,390]) test('page display saves only a reversible site draft at '+width+'px', async ({ page }) => {
  await page.setViewportSize({width,height:900})
  const {collections,requests,errors} = await mockAdmin(page, async (route,url) => {
    if (url.pathname === '/api/auth/session') { await route.fulfill({json:{mode:'cloud',authenticated:true,csrf:'synthetic-csrf'}}); return true }
    if (url.pathname === '/api/ai/status') { await route.fulfill({json:{configured:false}}); return true }
    if (url.pathname === '/api/publishing') { await route.fulfill({json:{cloud:true,available:true,repository:'CoolTrHzZ/Personal_Tool_Site',branch:'main',job:null,history:[]}}); return true }
    return false
  })
  const before = JSON.stringify(Object.fromEntries(Object.entries(collections).filter(([key]) => key !== 'site')))
  await page.locator('#dashboard-publishing [data-settings-shortcut="general"]').click()
  const form=page.locator('#site'), controls=form.locator('[name^="pageVisibility."]')
  await expect(controls).toHaveCount(7)
  await expect(form).toContainText('首页、后台管理与设置始终可用')
  await expect(form).toContainText('预览并显式发布')
  await expect(form).toContainText('不是访问控制')
  for (const control of await controls.all()) { await expect(control).toBeChecked(); await control.uncheck() }
  expect(requests.filter(item=>item.method !== 'GET')).toEqual([])
  await form.getByRole('button',{name:'保存展示草稿',exact:true}).click()
  await expect(controls.first()).not.toBeChecked()
  const expected=Object.fromEntries(DISPLAY_PAGES.map(page=>[page.id,false]))
  expect(collections.site.pageVisibility).toEqual(expected)
  expect(JSON.stringify(Object.fromEntries(Object.entries(collections).filter(([key])=>key !== 'site')))).toBe(before)
  expect(requests.filter(item=>item.method !== 'GET').map(item=>item.path)).toEqual(['/api/site'])
  const body=requests.find(item=>item.method==='PUT'&&item.path==='/api/site').body
  expect(Object.keys(body).some(key=>key.startsWith('pageVisibility.'))).toBe(false)
  for (const control of await controls.all()) await control.check()
  await form.getByRole('button',{name:'保存展示草稿',exact:true}).click()
  await expect(controls.first()).toBeChecked()
  expect(collections.site.pageVisibility).toEqual(Object.fromEntries(DISPLAY_PAGES.map(page=>[page.id,true])))
  expect(requests.filter(item=>item.method !== 'GET').map(item=>item.path)).toEqual(['/api/site','/api/site'])
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
