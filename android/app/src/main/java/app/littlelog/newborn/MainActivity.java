package app.littlelog.newborn;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(InsetsPlugin.class);
    registerPlugin(CalendarPlugin.class);   // the system bars' sizes and icon colours, for the page (see InsetsPlugin)
        super.onCreate(savedInstanceState);
    }
}
