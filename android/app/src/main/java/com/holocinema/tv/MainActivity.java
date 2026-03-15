package com.holocinema.tv;

import android.os.Bundle;
import android.os.Message;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private static final String AI_STUDIO_HOST = "ais-pre-zgturhw4row6gtvlf3jbq3-185322315707.europe-west2.run.app";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkInstallerPlugin.class);
        registerPlugin(NativePlayerPlugin.class);
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        settings.setSupportMultipleWindows(true);

        webView.setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                WebView popupWebView = new WebView(view.getContext());
                popupWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView popupView, WebResourceRequest request) {
                        view.loadUrl(request.getUrl().toString());
                        return true;
                    }

                    @Override
                    public boolean shouldOverrideUrlLoading(WebView popupView, String url) {
                        view.loadUrl(url);
                        return true;
                    }
                });

                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popupWebView);
                resultMsg.sendToTarget();
                return true;
            }
        });

        webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (AI_STUDIO_HOST.equalsIgnoreCase(url.getHost())) {
                    return false;
                }
                return super.shouldOverrideUrlLoading(view, request);
            }
        });
    }
}
