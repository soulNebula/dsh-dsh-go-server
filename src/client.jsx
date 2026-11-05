// Browser entry of 远程服务: a full page behind a sidebar entry.
// Register every DSH surface inside ctx.effect so uninstalling releases it.
import { App } from './ui/App.jsx'
import { en, NS, zh } from './ui/i18n.js'
import { STYLE } from './ui/styles.js'

export const inject = ['slots', 'locale', 'connection']

const PACKAGE = 'dsh-remote-server'
const PANEL_ID = 'dsh-remote-server'

function PanelIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01M7 16.5h.01" strokeLinecap="round" />
    </svg>
  )
}

function MainPage({ rpc, t }) {
  return <App rpc={rpc} t={t} />
}

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'copy')
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = PACKAGE
    tag.textContent = STYLE
    document.head.append(tag)
    return () => tag.remove()
  }, 'style')

  const t = ctx.locale.bind(NS)
  const rpc = ctx.get('connection').rpc

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: () => ({ rpc, t }),
  }, MainPage))

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 30,
    locale: NS,
    label: () => t('panelLabel'),
  }, PanelIcon))
}
