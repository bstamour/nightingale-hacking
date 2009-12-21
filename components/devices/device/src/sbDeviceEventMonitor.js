/*
 *=BEGIN SONGBIRD GPL
 *
 * This file is part of the Songbird web player.
 *
 * Copyright(c) 2005-2009 POTI, Inc.
 * http://www.songbirdnest.com
 *
 * This file may be licensed under the terms of of the
 * GNU General Public License Version 2 (the ``GPL'').
 *
 * Software distributed under the License is distributed
 * on an ``AS IS'' basis, WITHOUT WARRANTY OF ANY KIND, either
 * express or implied. See the GPL for the specific language
 * governing rights and limitations.
 *
 * You should have received a copy of the GPL along with this
 * program. If not, go to http://www.gnu.org/licenses/gpl.html
 * or write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
 *
 *=END SONGBIRD GPL
 */

/**
 * \file sbDeviceEventMonitor.js
 * \brief This service monitors devices for events, we can then perform various
 * tasks based on these events. This is a global monitor so it will get events
 * for all devices and also detects devices being added or removed.
 *
 */
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://app/jsmodules/sbProperties.jsm");
Cu.import("resource://app/jsmodules/sbLibraryUtils.jsm");
Cu.import("resource://app/jsmodules/StringUtils.jsm");
Cu.import("resource://app/jsmodules/sbSmartMediaListColumnSpecUpdater.jsm");

const VIDEO_TOGO_PLAYLIST_NAME = "video-togo";

var deviceEventMonitorConfig = {
  className:      "Songbird Device Event Monitor Service",
  cid:            Components.ID("{57b32ce8-a373-4d8d-babb-9d23afeeb409}"),
  contractID:     "@songbirdnest.com/device/event-monitor-service;1",

  ifList: [ Ci.sbIDeviceEventListener,
            Ci.nsISupportsWeakReference,
            Ci.nsIObserver ],

  categoryList:
  [
    {
      category: 'app-startup',
      entry: 'service-device-event-monitor',
      value: 'service,@songbirdnest.com/device/event-monitor-service;1'
    }
  ]
};

function deviceEventMonitor () {
  var obsSvc = Cc['@mozilla.org/observer-service;1']
                 .getService(Ci.nsIObserverService);

  // We want to wait until profile-after-change to initialize
  obsSvc.addObserver(this, 'profile-after-change', true);
  obsSvc.addObserver(this, 'quit-application', true);
}

deviceEventMonitor.prototype = {
  // XPCOM stuff
  classDescription: deviceEventMonitorConfig.className,
  classID: deviceEventMonitorConfig.cid,
  contractID: deviceEventMonitorConfig.contractID,
  _xpcom_categories: deviceEventMonitorConfig.categoryList,

  /**
   * \brief Initialize the deviceEventMonitor service.
   */
  _init: function deviceEventMonitor__init() {
    var deviceManagerSvc = Cc["@songbirdnest.com/Songbird/DeviceManager;2"]
                             .getService(Ci.sbIDeviceManager2);
    deviceManagerSvc.addEventListener(this);
  },

  /**
   * \brief Shutdown (cleanup) the deviceEventMonitorService.
   */
  _shutdown: function deviceEventMonitor__shutdown() {
    var deviceManagerSvc = Cc["@songbirdnest.com/Songbird/DeviceManager;2"]
                             .getService(Ci.sbIDeviceManager2);
    deviceManagerSvc.removeEventListener(this);
  },

  /**
   * \brief checks if a device supports video formats.
   * \param aDevice device to check.
   * \returns true if device supports video.
   */
  _deviceSupportsVideo:
    function deviceEventMonitor__deviceSupportsVideo(aDevice) {
    try {
      var contentTypes = aDevice.capabilities.getSupportedContentTypes(
                            Ci.sbIDeviceCapabilities.FUNCTION_VIDEO_PLAYBACK,
                            {});
      return contentTypes.some(
        function (contentType) {
          return (contentType == Ci.sbIDeviceCapabilities.CONTENT_VIDEO);
        }
      );
    }
    catch (err) {
      Cu.reportError("Unable to determine if device supports video:" + err);
    }

    return false;
  },

  /**
   * \brief Checks to see if the Video playlist exists in the main library, if
   * it does not then we will create the playlist if the device supports video.
   * \param aDevice device to check for video support
   */
  _checkForVideoPlaylist:
    function deviceEventMonitor__checkForVideoPlaylist(aDevice) {

    // Check if this device supports video and if not we are done.
    if (!this._deviceSupportsVideo(aDevice))
      return;

    var mainLibrary = LibraryUtils.mainLibrary;

    var listProperties =
      Cc["@songbirdnest.com/Songbird/Properties/MutablePropertyArray;1"]
        .createInstance(Ci.sbIMutablePropertyArray);
    listProperties.appendProperty(SBProperties.isList, "1");
    listProperties.appendProperty(SBProperties.hidden, "0");
    listProperties.appendProperty(SBProperties.customType,
                                  VIDEO_TOGO_PLAYLIST_NAME);

    var playlistFound = false;
    var searchListener = {
      onEnumerationBegin: function(aMediaList) {
        return Ci.sbIMediaListEnumerationListener.CONTINUE;
      },
      onEnumeratedItem: function(aMediaList, aMediaItem) {
        // Already created so we are done.
        playlistFound = true;
        return Ci.sbIMediaListEnumerationListener.CANCEL;
      },
      onEnumerationEnd: function(aMediaList, aStatusCode) {
      }
    };

    mainLibrary.enumerateItemsByProperties(listProperties,
                                           searchListener,
                                           Ci.sbIMediaList.ENUMERATIONTYPE_SNAPSHOT);

    if (!playlistFound) {
      // Create the playlist since it does not exist.
      var list = mainLibrary.createMediaList("simple");
      list.setProperty(SBProperties.customType, VIDEO_TOGO_PLAYLIST_NAME);
      list.name = SBString("device.sync.video-togo.playlist", "Video Playlist");
      list.setProperty(SBProperties.hidden, "0");
      SmartMediaListColumnSpecUpdater.update(list);
    }
  },

  // sbIDeviceEventListener
  onDeviceEvent: function deviceEventMonitor_onDeviceEvent(aDeviceEvent) {
    switch(aDeviceEvent.type) {
      case Ci.sbIDeviceEvent.EVENT_DEVICE_ADDED:
        var device = aDeviceEvent.data.QueryInterface(Ci.sbIDevice);
        if (device)
          this._checkForVideoPlaylist(device);
        break;
    }
  },

  // nsIObserver
  observe: function deviceEventMonitor_observer(subject, topic, data) {
    var obsSvc = Cc['@mozilla.org/observer-service;1']
                   .getService(Ci.nsIObserverService);

    switch (topic) {
      case 'quit-application':
        obsSvc.removeObserver(this, 'quit-application');
        this._shutdown();
      break;
      case 'profile-after-change':
        obsSvc.removeObserver(this, 'profile-after-change');
        this._init();
      break;
    }
  },

  // nsISupports
  QueryInterface: XPCOMUtils.generateQI(deviceEventMonitorConfig.ifList)
};

/**
 * /brief XPCOM initialization code
 */
function NSGetModule(compMgr, fileSpec) {
  return XPCOMUtils.generateModule([deviceEventMonitor]);
}
