package app.littlelog.newborn;

import android.content.Intent;
import android.provider.CalendarContract;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Puts an event into the phone's calendar through the calendar app's own "new event" screen, filled in: the user picks the
    calendar and saves there. Needs no calendar permission, and the app never reads the calendar. */
@CapacitorPlugin(name = "Calendar")
public class CalendarPlugin extends Plugin {
  @PluginMethod
  public void insert(PluginCall call) {
    Intent i = new Intent(Intent.ACTION_INSERT).setData(CalendarContract.Events.CONTENT_URI)
      .putExtra(CalendarContract.Events.TITLE, call.getString("title", ""))
      .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, call.getData().optLong("start", System.currentTimeMillis()))
      .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, call.getData().optLong("end", System.currentTimeMillis() + 3600000L))
      .putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, Boolean.TRUE.equals(call.getBoolean("allDay", false)))
      .putExtra(CalendarContract.Events.DESCRIPTION, call.getString("notes", ""))
      .putExtra(CalendarContract.Events.EVENT_LOCATION, call.getString("location", ""));
    try { getActivity().startActivity(i); call.resolve(); } catch (Exception e) { call.reject("No calendar app"); }
  }
}
