import Layout from '../components/layout/Layout'
import Footer from '../components/layout/Footer'
import Router from './router'
import { ToolCatalogProvider } from '../tools/runtime/ToolCatalog'

export default function App() { return <ToolCatalogProvider><Layout><Router /><Footer /></Layout></ToolCatalogProvider> }
