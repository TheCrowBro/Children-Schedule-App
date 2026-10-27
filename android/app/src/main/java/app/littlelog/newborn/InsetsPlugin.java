package app.littlelog.newborn;

import android.view.View;
import android.view.Window;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The phone's status and navigation bars. From Android 15 the app is drawn edge to edge, under both bars, and the web view's own
 * safe-area values stay at zero; this plugin tells the page how tall the bars are (in CSS pixels), and lets it ask for light or dark
 * bar icons to match its theme.
 */
@CapacitorPlugin(name = "Insets")
public class InsetsPlugin extends Plugin {
    private Insets last = Insets.NONE;

    @Override
    public void load() {
        View web = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(web, (v, insets) -> {
            last = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            notifyListeners("change", json(last), true);
            return insets;
        });
        ViewCompat.requestApplyInsets(web);
    }

    @PluginMethod
    public void get(PluginCall call) {
        call.resolve(json(last));
    }

    /** Dark icons on light bars ({ light: true }) or light icons on dark bars, to match the app's theme. */
    @PluginMethod
    public void setBars(PluginCall call) {
        boolean light = Boolean.TRUE.equals(call.getBoolean("light", true));
        getActivity().runOnUiThread(() -> {
            Window w = getActivity().getWindow();
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
            c.setAppearanceLightStatusBars(light);
            c.setAppearanceLightNavigationBars(light);
            call.resolve();
        });
    }

    private JSObject json(Insets b) {
        float d = getContext().getResources().getDisplayMetrics().density;
        JSObject o = new JSObject();
        o.put("top", b.top / d);
        o.put("bottom", b.bottom / d);
        o.put("left", b.left / d);
        o.put("right", b.right / d);
        return o;
    }
}
