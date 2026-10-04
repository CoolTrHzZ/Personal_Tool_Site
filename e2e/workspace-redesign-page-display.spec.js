import {test,expect} from '@playwright/test'
import {readFile} from 'node:fs/promises'
import {DISPLAY_PAGES} from '../shared/page-display.js'

async function displayFixture(page,visibility) {
  const site=JSON.parse(await readFile('src/data/site.json','utf8'))
  if (visibility !== undefined) site.pageVisibility=visibility
  await page.route('**/src/data/site.json*',route=>route.fulfill({contentType:'application/javascript',body:'export default '+JSON.stringify(site)}))
  await page.route('https://**/*',route=>route.abort())
}
test('legacy page settings retain all existing navigation and homepage entries',async({page})=>{
  await displayFixture(page)
  await page.goto('/#/')
  for (const item of DISPLAY_PAGES) await expect(page.locator('.top-nav').getByRole('link',{name:item.label,exact:true})).toBeVisible()
  await expect(page.locator('#today')).toBeVisible()
  await expect(page.locator('#sites')).toBeVisible()
})
test('closed component pages disappear from navigation, home and search, and direct details return to home',async({page})=>{
  await displayFixture(page,Object.fromEntries(DISPLAY_PAGES.map(page=>[page.id,false])))
  await page.goto('/#/')
  await expect(page.locator('.top-nav a')).toHaveCount(1)
  await expect(page.locator('#today,#tools,#sites,#ai,#library,#notes')).toHaveCount(0)
  await expect(page.locator('a[href^="#/"]:not(.brand)').filter({hasNotText:'首页'})).toHaveCount(0)
  await page.getByRole('button',{name:'打开命令面板',exact:true}).first().click()
  await expect(page.locator('.command-list [role="option"]')).toHaveCount(0)
  await expect(page.locator('.command-list')).toContainText('没有匹配内容')
  await page.getByRole('button',{name:'关闭命令面板',exact:true}).click()
  for (const path of ['/projects','/projects/synthetic','/ai?resource=synthetic','/tools','/tools/json','/cfg','/cfg/synthetic','/nav','/library','/notes','/notes/synthetic']) {
    await page.goto('/#'+path)
    await expect(page.getByRole('heading',{name:'页面当前未展示',exact:true})).toBeVisible()
    await expect(page.getByRole('link',{name:'← 返回首页',exact:true})).toBeVisible()
  }
  await page.getByRole('link',{name:'← 返回首页',exact:true}).click()
  await expect(page.locator('.home-page')).toBeVisible()
})
test('one closed page keeps other pages visible and hides its cross-page links',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  await displayFixture(page,{tools:false})
  await page.goto('/#/ai')
  await expect(page.locator('.top-nav').getByRole('link',{name:'工具',exact:true})).toHaveCount(0)
  await expect(page.locator('.top-nav').getByRole('link',{name:'AI Hub',exact:true})).toHaveCount(1)
  await expect(page.getByRole('link',{name:'我的 AI 任务',exact:true})).toHaveCount(0)
  await page.goto('/#/')
  await expect(page.locator('#today,#tools')).toHaveCount(0)
  await expect(page.locator('#sites')).toBeVisible()
  await expect(page.locator('a[href^="#/tools"]')).toHaveCount(0)
})
