/*
//
// BEGIN SONGBIRD GPL
//
// This file is part of the Songbird web player.
//
// Copyright(c) 2005-2008 POTI, Inc.
// http://songbirdnest.com
//
// This file may be licensed under the terms of of the
// GNU General Public License Version 2 (the "GPL").
//
// Software distributed under the License is distributed
// on an "AS IS" basis, WITHOUT WARRANTY OF ANY KIND, either
// express or implied. See the GPL for the specific language
// governing rights and limitations.
//
// You should have received a copy of the GPL along with this
// program. If not, go to http://www.gnu.org/licenses/gpl.html
// or write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
//
// END SONGBIRD GPL
//
*/

#include "sbGStreamerPlatformWin32.h"

#include "sbGStreamerSimple.h"

#include <prlog.h>
#include <nsDebug.h>

#ifdef PR_LOGGING
extern PRLogModuleInfo* gGStreamerLog;
#endif /* PR_LOGGING */

#define TRACE(args) PR_LOG(gGStreamerLog, PR_LOG_DEBUG, args)
#define LOG(args)   PR_LOG(gGStreamerLog, PR_LOG_WARN, args)

#define SB_VIDEOWINDOW_CLASSNAME L"SBGStreamerVideoWindow"

// TODO: This is a temporary bit of "UI" to get out of fullscreen mode.
// We'll do this properly at some point in the future.
/* static */ LRESULT APIENTRY
Win32PlatformInterface::VideoWindowProc(HWND hWnd, UINT message, 
        WPARAM wParam, LPARAM lParam)
{
  Win32PlatformInterface *platform = 
      (Win32PlatformInterface *)GetWindowLongPtr(hWnd, GWLP_USERDATA);

  switch (message) {
    // If we're in full-screen mode, switch out on left-click
    case WM_LBUTTONDOWN:
      if (platform->mFullscreen) {
        platform->SetFullscreen(false);
        platform->ResizeToWindow();
      }
      break;
  }

  return DefWindowProc(hWnd, message, wParam, lParam);
}

Win32PlatformInterface::Win32PlatformInterface(nsIBoxObject *aVideoBox, 
        HWND aParent) : 
    BasePlatformInterface(aVideoBox),
    mWindow(NULL),
    mFullscreenWindow(NULL),
    mParentWindow(aParent)
{
  WNDCLASS WndClass;

  ::ZeroMemory(&WndClass, sizeof (WNDCLASS));

  WndClass.style = CS_HREDRAW | CS_VREDRAW;
  WndClass.hInstance = GetModuleHandle(NULL);
  WndClass.lpszClassName = SB_VIDEOWINDOW_CLASSNAME;
  WndClass.hbrBackground = (HBRUSH) GetStockObject(BLACK_BRUSH);
  WndClass.cbClsExtra = 0;
  WndClass.cbWndExtra = 0;
  WndClass.lpfnWndProc = VideoWindowProc;
  WndClass.hCursor = ::LoadCursor(NULL, IDC_ARROW);
 
  ::RegisterClass(&WndClass);

  mWindow = ::CreateWindowEx(
          0,                                  // extended window style
          SB_VIDEOWINDOW_CLASSNAME,           // Class name
          L"Songbird GStreamer Video Window", // Window name
          WS_CHILD,                           // window style
          0, 0,                               // X,Y offset
          0, 0,                               // Width, height
          parent,                             // Parent window
          NULL,                               // Menu, or child identifier
          WndClass.hInstance,                 // Module handle
          NULL);                              // Extra parameter

  ::SetWindowLongPtr(mWindow, GWLP_USERDATA, (LONG)this);

  // Display our normal window 
  ::ShowWindow(mWindow, SW_SHOWNORMAL);
}

void
Win32PlatformInterface::FullScreen()
{
  NS_ASSERTION(mFullscreenWindow == NULL, "Fullscreen window is not null");

  HMONITOR monitor;
  MONITORINFO info;

  monitor = ::MonitorFromWindow(mWindow, MONITOR_DEFAULTTOPRIMARY);
  info.cbSize = sizeof (MONITORINFO);
  ::GetMonitorInfo(monitor, &info);

  mFullscreenWindow = ::CreateWindowEx(
    0,
    SB_VIDEOWINDOW_CLASSNAME,
    L"Songbird Fullscreen Video Window",
    WS_POPUP,
    info.rcMonitor.top, info.rcMonitor.left,
    info.rcMonitor.bottom - info.rcMonitor.top, 
    info.rcMonitor.right - info.rcMonitor.left,
    NULL, NULL, NULL, NULL);

  ::SetWindowLongPtr(mWindow, GWLP_USERDATA, (LONG)this);

  ::SetParent(mWindow, mFullscreenWindow);
  ::ShowWindow(mFullscreenWindow, SW_SHOWMAXIMIZED);

  SetDisplayArea(info.rcMonitor.top, info.rcMonitor.left, 
        info.rcMonitor.bottom - info.rcMonitor.top, 
        info.rcMonitor.right - info.rcMonitor.left);
  ResizeVideo();

  ::ShowCursor(FALSE);
}

void 
Win32PlatformInterface::UnFullScreen()
{
  NS_ASSERTION(mFullscreenWindow, "Fullscreen window is null");

  ::SetParent(mWindow, mParentWindow);

  // Our caller should call Resize() after this to make sure we get moved to
  // the correct location
  ::ShowWindow(mWindow, SW_SHOWNORMAL);
  
  ::DestroyWindow(mFullscreenWindow);
  mFullscreenWindow = NULL;

  ::ShowCursor(TRUE);
}


void Win32PlatformInterface::MoveVideoWindow(int x, int y,
        int width, int height)
{
  ::SetWindowPos(mWindow, NULL, x, y, width, height, SWP_NOZORDER);
}


GstElement *
Win32PlatformInterface::CreateVideoSink()
{
  mVideoSink = ::gst_element_factory_make("dshowvideosink", NULL);
  if (!mVideoSink)
    mVideoSink = ::gst_element_factory_make("autovideosink", NULL);

  // Keep a reference to it.
  if (mVideoSink) 
      gst_object_ref(mVideoSink);

  return mVideoSink;
}

GstElement *
Win32PlatformInterface::CreateAudioSink()
{
  // Hopefully autoaudiosink will pick something appropriate...
  mAudioSink = gst_element_factory_make("autoaudiosink", "audio-sink");

  // Keep a reference to it.
  if (mAudioSink) 
      gst_object_ref(mAudioSink);

  return mAudioSink;
}

void
Win32PlatformInterface::SetXOverlayWindowID(GstXOverlay *aXOverlay)
{
  /* GstXOverlay is confusingly named - it's actually generic enough for windows
   * too, so the windows videosink implements it too.
   * So, we use the GstXOverlay interface to set the window handle here 
   */
  gst_x_overlay_set_xwindow_id(aXOverlay, (glong)mWindow);
  LOG(("Set xoverlay %p to HWND %x\n", aXOverlay, mWindow));
}


