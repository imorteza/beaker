/**
 * Sidebar
 *
 * NOTES
 * - Sidebar views are created as-needed, and desroyed when not in use
 * - Sidebar views are attached to individual BrowserView instances
 * - Sidebar views are shown and hidden based on whether its owning BrowserView is visible
 */

import path from 'path'
import { BrowserView } from 'electron'
import * as tabManager from '../tab-manager'
import { findWebContentsParentWindow } from '../../lib/electron'

// globals
// =

export const SIDEBAR_Y = 76
export const SIDEBAR_EDGE_PADDING = 6
export const HALF_SIDEBAR_EDGE_PADDING = SIDEBAR_EDGE_PADDING / 2
var views = {} // map of {[tab.id] => BrowserView}

// exported api
// =

export function setup (parentWindow) {
}

export function destroy (parentWindow) {
  // destroy all under this window
  for (let tab of tabManager.getAll(parentWindow)) {
    if (tab.id in views) {
      views[tab.id].destroy()
      delete views[tab.id]
    }
  }
}

export function reposition (parentWindow) {
  // reposition all under this window
  for (let tab of tabManager.getAll(parentWindow)) {
    if (tab.id in views) {
      setBounds(views[tab.id], tab)
    }
  }
}

export function repositionOne (tab) {
  if (tab.id in views) {
    setBounds(views[tab.id], tab)
  }
}

export function create (tab) {
  // make sure a sidebar doesnt already exist
  if (tab.id in views) {
    return
  }

  // create the view
  var view = views[tab.id] = new BrowserView({
    webPreferences: {
      defaultEncoding: 'utf-8',
      preload: path.join(__dirname, 'fg', 'webview-preload', 'index.build.js')
    }
  })
  view.webContents.on('console-message', (e, level, message) => {
    console.log('Sidebar window says:', message)
  })
  return view
}

export function get (tab) {
  return views[tab.id]
}

export function findContainingWindow (sidebarView) {
  return findWebContentsParentWindow(sidebarView.webContents)
}

export function show (tab) {
  if (tab.id in views) {
    tab.browserWindow.addBrowserView(views[tab.id])
    setBounds(views[tab.id], tab)
  }
}

export function hide (tab) {
  if (tab.id in views) {
    tab.browserWindow.removeBrowserView(views[tab.id])
  }
}

export function close (tab) {
  if (tab.id in views) {
    tab.browserWindow.removeBrowserView(views[tab.id])
    views[tab.id].destroy()
    delete views[tab.id]
  }
}

// internal methods
// =

function setBounds (sidebarView, tab) {
  var parentBounds = tab.browserWindow.getContentBounds()
  sidebarView.setBounds({
    x: 0,
    y: SIDEBAR_Y,
    width: tab.sidebarWidth - HALF_SIDEBAR_EDGE_PADDING,
    height: parentBounds.height - SIDEBAR_Y - tabManager.FOOTER_HEIGHT
  })
}
