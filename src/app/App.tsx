import Layout from '../components/layout/Layout'
import Router from './router'
import { ToolCatalogProvider } from '../tools/runtime/ToolCatalog'

export default function App() { return <ToolCatalogProvider><Layout><Router /></Layout></ToolCatalogProvider> }
