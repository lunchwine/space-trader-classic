package io.github.carmenity.spacetraderport;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStream;

/**
 * Offline WebView shell for the single-file Space Trader port (assets/index.html).
 * No permissions, no network: every non-local request is refused.
 */
public class MainActivity extends Activity {
    private static final String PAGE = "file:///android_asset/index.html";
    private static final int REQ_CHOOSE_FILE = 1;
    private static final int REQ_SAVE_FILE = 2;

    // The page exports a save as a blob: URL on a download link, which a WebView cannot
    // download by itself. Hand the blob to the app so it can use the system file picker.
    private static final String EXPORT_SHIM =
        "(function(){if(window.__stShim)return;window.__stShim=1;"
        + "var blobs={},make=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;"
        + "URL.createObjectURL=function(b){var u=make.call(URL,b);blobs[u]=b;return u;};"
        + "HTMLAnchorElement.prototype.click=function(){"
        + "if(this.download&&blobs[this.href]){var n=this.download,b=blobs[this.href],r=new FileReader();"
        + "r.onload=function(){STAndroid.saveFile(n,b.type||'application/octet-stream',"
        + "String(r.result).split(',')[1]);};r.readAsDataURL(b);return;}"
        + "return click.call(this);};})();";

    private WebView web;
    private ValueCallback<Uri[]> fileChooser;
    private byte[] pendingSave;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF244A00); // the game's status-bar green, shown behind system bars
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        // Edge-to-edge is forced on targetSdk 35: keep the game out from under the system bars.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });

        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);          // saves live in localStorage
        ws.setAllowFileAccess(false);           // file:///android_asset is still served
        ws.setAllowContentAccess(false);
        ws.setBlockNetworkLoads(true);
        ws.setSupportZoom(false);
        ws.setBuiltInZoomControls(false);
        web.addJavascriptInterface(new Bridge(), "STAndroid");

        web.setWebViewClient(new WebViewClient() {
            private boolean local(Uri u) {
                String s = u.getScheme();
                return "file".equals(s) || "blob".equals(s) || "data".equals(s) || "about".equals(s);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return !local(r.getUrl()); // swallow links to the web; never leave the app
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                if (local(r.getUrl())) return null;
                return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                v.evaluateJavascript(EXPORT_SHIM, null);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileChooser != null) fileChooser.onReceiveValue(null);
                fileChooser = cb;
                try {
                    startActivityForResult(params.createIntent(), REQ_CHOOSE_FILE);
                } catch (Exception e) {
                    fileChooser = null;
                    return false;
                }
                return true;
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl(PAGE);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    /** Same back behaviour as the browser build: the page keeps its own history stack. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == REQ_CHOOSE_FILE && fileChooser != null) {
            fileChooser.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileChooser = null;
        } else if (request == REQ_SAVE_FILE) {
            byte[] bytes = pendingSave;
            pendingSave = null;
            if (result == RESULT_OK && data != null && data.getData() != null && bytes != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                    if (out == null) throw new IOException("no stream");
                    out.write(bytes);
                } catch (IOException e) {
                    Toast.makeText(this, R.string.save_failed, Toast.LENGTH_LONG).show();
                }
            }
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }

    private class Bridge {
        @JavascriptInterface
        public void saveFile(String name, String mime, String base64) {
            final byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            runOnUiThread(() -> {
                pendingSave = bytes;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType(mime)
                    .putExtra(Intent.EXTRA_TITLE, name);
                startActivityForResult(i, REQ_SAVE_FILE);
            });
        }
    }
}
