import { Globe2 } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function NotFound() { return <main className="page not-found"><Globe2 size={42} /><h1>页面不存在</h1><p>这个地址没有对应内容。</p><Link className="primary link-button" to="/">返回首页</Link></main> }
