import React from 'react'

import { createApi } from './api.js'
import { createRemoteControl } from './remote-control.js'

function Field({ label, value }) {
  return (
    <div className="p-field">
      <span className="p-fieldLabel">{label}</span>
      <span className="p-fieldValue">{value}</span>
    </div>
  )
}

function StateBadge({ state, t }) {
  return <span className={`p-badge p-badge--${state}`}>{t(`state_${state}`)}</span>
}

function CopyRow({ label, value, t }) {
  const [copied, setCopied] = React.useState(false)
  const shown = value && String(value).trim() ? String(value) : t('missing')

  async function copy() {
    if (!value) return
    try {
      await navigator.clipboard.writeText(String(value))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable: the value is visible, nothing to do
    }
  }

  return (
    <div className="p-kv">
      <span className="p-kvLabel">{label}</span>
      <code className="p-kvValue">{shown}</code>
      <button type="button" className="p-copy" onClick={copy} disabled={!value}>{copied ? t('copied') : t('btnCopy')}</button>
    </div>
  )
}

function UsageGroup({ title, steps, t }) {
  return (
    <div className="p-usageGroup">
      <h3 className="p-usageTitle">{t(title)}</h3>
      <ol className="p-steps">
        {steps.map(key => <li key={key}>{t(key)}</li>)}
      </ol>
    </div>
  )
}

function SettingsView({ meta, config, t, onGotoConfig }) {
  if (!meta) return <p className="p-empty">{t('settingsIntro')}</p>
  const url = (config && config.publicUrl) || t('notConfigured')
  const account = (config && config.account) || t('notConfigured')

  return (
    <>
      <p className="p-intro">{t('settingsIntro')}</p>

      <section className="p-card">
        <h2 className="p-cardTitle">{t('infoTitle')}</h2>
        <div className="p-kvList">
          <CopyRow label={t('labelVersion')} value={meta.version === 'unknown' ? t('versionUnknown') : meta.version} t={t} />
          <CopyRow label={t('labelSource')} value={meta.sourceDir} t={t} />
          <CopyRow label={t('labelDataDir')} value={meta.dataDir} t={t} />
          <CopyRow label={t('labelPrefs')} value={meta.prefsFile} t={t} />
          <CopyRow label={t('labelChannel')} value={meta.channel} t={t} />
          <CopyRow label={t('labelDshHome')} value={meta.dshHome} t={t} />
        </div>
      </section>

      <section className="p-card">
        <h2 className="p-cardTitle">{t('filesTitle')}</h2>
        <div className="p-kvList">
          <CopyRow label={t('labelServerRoot')} value={meta.server.rootDir} t={t} />
          <CopyRow label={t('labelEnvFile')} value={meta.server.envFile} t={t} />
          <CopyRow label={t('labelStateFile')} value={meta.server.stateFile} t={t} />
          <CopyRow label={t('labelLogFile')} value={meta.server.logFile} t={t} />
        </div>
        <div className="p-row">
          <button type="button" className="p-buttonGhost" onClick={onGotoConfig}>{t('gotoConfig')}</button>
        </div>
      </section>

      <section className="p-card">
        <h2 className="p-cardTitle">{t('usageTitle')}</h2>
        <UsageGroup title="usageComputer" steps={['usageComputer1', 'usageComputer2', 'usageComputer3']} t={t} />
        <UsageGroup title="usagePhone" steps={['usagePhone1', 'usagePhone2', 'usagePhone3', 'usagePhone4']} t={t} />
        <UsageGroup title="usageDaily" steps={['usageDaily1', 'usageDaily2', 'usageDaily3']} t={t} />
        <p className="p-hint p-usageVars">{url} · {account}</p>
      </section>

      <section className="p-card">
        <h2 className="p-cardTitle">{t('notesTitle')}</h2>
        <ul className="p-notes">
          <li>{t('notes1')}</li>
          <li>{t('notes2')}</li>
          <li>{t('notes3')}</li>
        </ul>
      </section>
    </>
  )
}

export function App({ rpc, t }) {
  const api = React.useMemo(() => createApi(rpc), [rpc])
  const remote = React.useMemo(() => createRemoteControl(), [])

  const [tab, setTab] = React.useState('overview')
  const [status, setStatus] = React.useState(null)
  const [config, setConfig] = React.useState(null)
  const [meta, setMeta] = React.useState(null)
  const [session, setSession] = React.useState({ signedIn: false })
  const [devices, setDevices] = React.useState(null)
  const [logs, setLogs] = React.useState(null)
  const [remoteView, setRemoteView] = React.useState(null)
  const [remoteError, setRemoteError] = React.useState('')
  const [remoteForm, setRemoteForm] = React.useState({ serverUrl: '', email: '', password: '' })
  const [remoteBusy, setRemoteBusy] = React.useState('')
  const [busy, setBusy] = React.useState('')
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [editing, setEditing] = React.useState('')
  const [editName, setEditName] = React.useState('')
  const [form, setForm] = React.useState({ email: '', password: '', port: '', publicUrl: '', rootDir: '' })

  const refreshRemote = React.useCallback(async () => {
    try {
      const view = await remote('settings.get')
      setRemoteView(view)
      setRemoteError('')
      setRemoteForm(previous => ({
        ...previous,
        serverUrl: view?.config?.serverUrl ?? previous.serverUrl,
      }))
      return view
    } catch (reason) {
      setRemoteView(null)
      setRemoteError(reason.message || 'unavailable')
      return null
    }
  }, [remote])

  const refreshStatus = React.useCallback(async () => {
    const next = await api.call('server/status')
    setStatus(next)
    return next
  }, [api])

  const load = React.useCallback(async () => {
    const [nextStatus, nextConfig, nextSession, nextMeta] = await Promise.all([
      api.call('server/status'),
      api.call('config/get'),
      api.call('account/session'),
      api.call('app/meta'),
    ])
    setStatus(nextStatus)
    setConfig(nextConfig)
    setSession(nextSession)
    setMeta(nextMeta)
    setForm(previous => ({
      ...previous,
      email: nextConfig.account ?? '',
      port: String(nextConfig.port ?? ''),
      publicUrl: nextConfig.publicUrl ?? '',
      rootDir: nextConfig.rootDir ?? '',
    }))
    setRemoteForm(previous => ({ ...previous, email: previous.email || nextConfig.account || '' }))
    await refreshRemote()
  }, [api, refreshRemote])

  React.useEffect(() => {
    load().catch(reason => setError(reason.message))
  }, [load])

  React.useEffect(() => {
    const timer = setInterval(() => {
      api.call('server/status').then(setStatus).catch(() => undefined)
    }, 5000)
    return () => clearInterval(timer)
  }, [api])

  function begin(message) {
    setBusy(message)
    setError('')
    setNotice('')
  }

  async function runService(action, label) {
    begin(label)
    try {
      const snapshot = await api.call(`server/${action}`)
      const result = await api.follow(snapshot)
      if (result?.failed) throw new Error(result.message)
      setStatus(result)
      setNotice(t(`notice${action === 'start' ? 'Started' : action === 'stop' ? 'Stopped' : 'Restarted'}`))
      const nextConfig = await api.call('config/get').catch(() => null)
      if (nextConfig) setConfig(nextConfig)
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy('')
    }
  }

  async function saveConfig() {
    begin(t('btnSave'))
    try {
      const result = await api.call('config/save', {
        account: form.email,
        password: form.password || undefined,
        port: form.port,
        publicUrl: form.publicUrl,
        rootDir: form.rootDir,
      })
      setConfig(result.config)
      setForm(previous => ({ ...previous, password: '' }))
      setNotice(result.needsRestart ? t('noticeRestart') : t('noticeSaved'))
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy('')
    }
  }

  async function testCredentials() {
    begin(t('btnTest'))
    try {
      const result = await api.call('account/test', { email: form.email || undefined, password: form.password || undefined })
      setNotice(t('noticeTestOk', { account: result.account }))
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy('')
    }
  }

  async function signIn() {
    begin(t('btnLogin'))
    try {
      // Sign-in uses the account already saved in .env; the password field is
      // only for changing it, so nothing from the form is sent here.
      const next = await api.call('account/login')
      setSession(next)
      setNotice(t('noticeLoggedIn'))
      await loadDevices()
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy('')
    }
  }

  async function signOut() {
    begin(t('btnLogout'))
    try {
      const next = await api.call('account/logout')
      setSession(next)
      setDevices(null)
      setNotice(t('noticeLoggedOut'))
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy('')
    }
  }

  async function loadDevices() {
    try {
      const result = await api.call('devices/list')
      setDevices(result.items)
    } catch (reason) {
      setDevices(null)
      setError(reason.message)
    }
  }

  async function renameDevice(deviceId) {
    try {
      await api.call('devices/rename', { deviceId, name: editName })
      setEditing('')
      setEditName('')
      await loadDevices()
    } catch (reason) {
      setError(reason.message)
    }
  }

  async function loadLogs() {
    try {
      const result = await api.call('logs/tail', { lines: 60 })
      setLogs(result.lines)
    } catch (reason) {
      setError(reason.message)
    }
  }

  async function saveRemoteServer() {
    const serverUrl = remoteForm.serverUrl.trim()
    if (!serverUrl) return
    setRemoteBusy('server')
    setError('')
    setNotice('')
    try {
      const result = await remote('settings.server.set', { serverUrl })
      setNotice(result?.applies === 'live' ? t('remoteServerLive') : t('remoteServerRestart'))
      await refreshRemote()
    } catch (reason) {
      setError(reason.message)
    } finally {
      setRemoteBusy('')
    }
  }

  async function useHostRole() {
    setRemoteBusy('role')
    setError('')
    setNotice('')
    try {
      await remote('settings.role.set', { role: 'host' })
      setNotice(t('remoteRoleSaved'))
      await refreshRemote()
    } catch (reason) {
      setError(reason.message)
    } finally {
      setRemoteBusy('')
    }
  }

  async function registerHost() {
    const email = remoteForm.email.trim()
    const password = remoteForm.password
    if (!email || !password) {
      setError(t('remoteLoginRequired'))
      return
    }
    setRemoteBusy('register')
    setError('')
    setNotice('')
    try {
      await remote('host.account.login', { email, password })
      setRemoteForm(previous => ({ ...previous, password: '' }))
      setNotice(t('remoteRegistered'))
      await refreshRemote()
    } catch (reason) {
      setError(reason.message)
    } finally {
      setRemoteBusy('')
    }
  }

  const state = status?.state ?? 'stopped'
  const disabled = Boolean(busy)

  const overview = (
    <>
      {error ? <p className="p-error">{t('errorTitle')}：{error}</p> : null}
      {notice ? <p className="p-notice">{notice}</p> : null}

      <section className="p-card">
        <div className="p-cardHead">
          <h2 className="p-cardTitle">{t('statusTitle')}</h2>
          <div className="p-row">
            <StateBadge state={state} t={t} />
            <button type="button" className="p-buttonGhost" onClick={() => refreshStatus().catch(reason => setError(reason.message))}>
              {t('btnRefresh')}
            </button>
          </div>
        </div>
        <div className="p-grid">
          <Field label={t('fieldPort')} value={status?.port ?? '—'} />
          <Field label={t('fieldAddress')} value={status?.publicUrl || t('missing')} />
          <Field label={t('fieldAccount')} value={status?.account || t('notConfigured')} />
          <Field label={t('fieldPassword')} value={status?.passwordSet ? t('passwordSet') : t('passwordUnset')} />
          <Field label={t('fieldPid')} value={status?.pid ?? t('missing')} />
          <Field label={t('fieldLatency')} value={status?.latencyMs == null ? t('missing') : t('latencyUnit', { ms: status.latencyMs })} />
        </div>
        <div className="p-row">
          <button type="button" className="p-button" disabled={disabled || state !== 'stopped'} onClick={() => runService('start', t('busyStart'))}>
            {busy === t('busyStart') ? t('busyStart') : t('btnStart')}
          </button>
          <button type="button" className="p-button" disabled={disabled || state === 'stopped'} onClick={() => runService('stop', t('busyStop'))}>
            {busy === t('busyStop') ? t('busyStop') : t('btnStop')}
          </button>
          <button type="button" className="p-buttonGhost" disabled={disabled || state === 'stopped'} onClick={() => runService('restart', t('busyRestart'))}>
            {busy === t('busyRestart') ? t('busyRestart') : t('btnRestart')}
          </button>
        </div>
        {status && !status.installed ? <p className="p-hint">{t('installHint')}</p> : null}
      </section>

      <section className="p-card">
        <h2 className="p-cardTitle">{t('accountTitle')}</h2>
        <div className="p-formColumn">
          <label className="p-label">
            {t('labelEmail')}
            <input className="p-input" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="name@example.com" />
          </label>
          <label className="p-label">
            {t('labelPassword')}
            <input className="p-input" type="password" value={form.password} autoComplete="new-password" onChange={event => setForm({ ...form, password: event.target.value })} />
            <span className="p-hint">{t('labelPasswordHint')}</span>
          </label>
          <div className="p-row">
            <label className="p-label p-label--half">
              {t('labelPort')}
              <input className="p-input" value={form.port} onChange={event => setForm({ ...form, port: event.target.value })} inputMode="numeric" />
            </label>
            <label className="p-label p-label--grow">
              {t('labelPublicUrl')}
              <input className="p-input" value={form.publicUrl} onChange={event => setForm({ ...form, publicUrl: event.target.value })} placeholder="http://192.168.1.10:8080" />
            </label>
          </div>
          <label className="p-label">
            {t('labelRootDir')}
            <input className="p-input" value={form.rootDir} onChange={event => setForm({ ...form, rootDir: event.target.value })} />
          </label>
          <div className="p-row">
            <button type="button" className="p-button" disabled={disabled} onClick={saveConfig}>{t('btnSave')}</button>
            <button type="button" className="p-buttonGhost" disabled={disabled} onClick={testCredentials}>{t('btnTest')}</button>
            {session.signedIn
              ? <button type="button" className="p-buttonGhost" disabled={disabled} onClick={signOut}>{t('btnLogout')}</button>
              : <button type="button" className="p-buttonGhost" disabled={disabled} onClick={signIn}>{t('btnLogin')}</button>}
            <span className="p-meta">{session.signedIn ? t('signedInAs', { account: session.account }) : t('signedOut')}</span>
          </div>
        </div>
      </section>

      <section className="p-card">
        <div className="p-cardHead">
          <h2 className="p-cardTitle">{t('remoteTitle')}</h2>
          <span className="p-meta">
            {remoteError ? t('remoteUnavailable') : (remoteView?.config?.role === 'client' ? t('remoteRoleClient') : t('remoteRoleHost'))}
          </span>
        </div>
        {remoteError ? (
          <p className="p-hint">{t('remoteUnavailableHint')}</p>
        ) : (
          <>
            <div className="p-grid">
              <Field label={t('remoteServer')} value={remoteView?.config?.serverUrl || t('notConfigured')} />
              <Field label={t('remoteRole')} value={remoteView?.config?.role === 'client' ? t('remoteRoleClient') : t('remoteRoleHost')} />
              <Field
                label={t('remoteHostState')}
                value={remoteView?.associations?.host
                  ? t('remoteRegisteredAs', { account: remoteView.associations.host.account || '—' })
                  : t('remoteNotRegistered')}
              />
            </div>
            <div className="p-row">
              <input
                className="p-input p-input--grow"
                value={remoteForm.serverUrl}
                onChange={event => setRemoteForm({ ...remoteForm, serverUrl: event.target.value })}
                placeholder="http://192.168.31.62:8080"
              />
              <button type="button" className="p-buttonGhost" disabled={Boolean(remoteBusy)} onClick={saveRemoteServer}>
                {t('remoteSaveServer')}
              </button>
              <button
                type="button"
                className="p-buttonGhost"
                disabled={Boolean(remoteBusy) || remoteView?.config?.role === 'host'}
                onClick={useHostRole}
              >
                {t('remoteSetHost')}
              </button>
            </div>
            <div className="p-row">
              <input
                className="p-input p-input--grow"
                value={remoteForm.email}
                onChange={event => setRemoteForm({ ...remoteForm, email: event.target.value })}
                placeholder={t('remoteEmail')}
              />
              <input
                className="p-input p-input--grow"
                type="password"
                autoComplete="off"
                value={remoteForm.password}
                onChange={event => setRemoteForm({ ...remoteForm, password: event.target.value })}
                placeholder={t('remotePassword')}
              />
              <button type="button" className="p-button" disabled={Boolean(remoteBusy)} onClick={registerHost}>
                {t('remoteRegister')}
              </button>
            </div>
            <p className="p-hint">{t('remoteHint')}</p>
          </>
        )}
      </section>

      <section className="p-card">
        <div className="p-cardHead">
          <h2 className="p-cardTitle">{t('devicesTitle')}</h2>
          <button type="button" className="p-buttonGhost" disabled={disabled || !session.signedIn} onClick={loadDevices}>{t('btnLoadDevices')}</button>
        </div>
        {devices === null ? null : devices.length === 0 ? (
          <p className="p-empty">{t('devicesEmpty')}</p>
        ) : (
          <ul className="p-list">
            {devices.map(device => (
              <li key={device.deviceId} className="p-device">
                <div className="p-deviceMain">
                  <span className="p-deviceName">
                    {device.name}
                    <span className={`p-tag p-tag--${device.online ? 'online' : 'offline'}`}>
                      {device.online ? t('deviceOnline') : t('deviceOffline')}
                    </span>
                    <span className="p-tag">{device.role === 'host' ? t('deviceHost') : t('deviceClient')}</span>
                  </span>
                  <span className="p-meta">{device.deviceId}</span>
                </div>
                {editing === device.deviceId ? (
                  <div className="p-row">
                    <input className="p-input" value={editName} onChange={event => setEditName(event.target.value)} />
                    <button type="button" className="p-button" onClick={() => renameDevice(device.deviceId)}>{t('deviceSave')}</button>
                  </div>
                ) : (
                  <button type="button" className="p-buttonGhost" onClick={() => { setEditing(device.deviceId); setEditName(device.name) }}>
                    {t('deviceRename')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="p-card">
        <div className="p-cardHead">
          <h2 className="p-cardTitle">{t('logsTitle')}</h2>
          <button type="button" className="p-buttonGhost" onClick={loadLogs}>{t('btnLoadLogs')}</button>
        </div>
        {logs === null ? null : logs.length === 0 ? (
          <p className="p-empty">{t('logsEmpty')}</p>
        ) : (
          <pre className="p-pre">{logs.join('\n')}</pre>
        )}
      </section>
    </>
  )

  return (
    <div className="p-app">
      <div className="p-inner">
        <header className="p-head">
          <div>
            <h1 className="p-title">{t('title')}</h1>
            <p className="p-intro">{t('intro')}</p>
          </div>
          <div className="p-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'overview'} className={tab === 'overview' ? 'p-tab p-tab--active' : 'p-tab'} onClick={() => setTab('overview')}>
              {t('tabOverview')}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'settings'} className={tab === 'settings' ? 'p-tab p-tab--active' : 'p-tab'} onClick={() => setTab('settings')}>
              {t('tabSettings')}
            </button>
          </div>
        </header>

        {tab === 'settings'
          ? <SettingsView meta={meta} config={config} t={t} onGotoConfig={() => setTab('overview')} />
          : overview}
      </div>
    </div>
  )
}
