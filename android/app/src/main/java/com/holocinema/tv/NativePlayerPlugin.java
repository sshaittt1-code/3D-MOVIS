package com.holocinema.tv;

import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.ui.PlayerView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Collections;

@CapacitorPlugin(name = "NativePlayer")
public class NativePlayerPlugin extends Plugin {
    private FrameLayout overlayRoot;
    private PlayerView playerView;
    private ExoPlayer player;
    private MediaSession mediaSession;
    private TextView titleView;
    private LinearLayout autoplayOverlay;
    private TextView autoplayTitleView;
    private TextView autoplayCountdownView;
    private Button autoplayDismissButton;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable progressRunnable;

    private final Player.Listener playerListener = new Player.Listener() {
        @Override
        public void onPlaybackStateChanged(int playbackState) {
            emitProgress();
            if (playbackState == Player.STATE_ENDED) {
                notifyListeners("ended", new JSObject());
            }
        }

        @Override
        public void onIsPlayingChanged(boolean isPlaying) {
            emitProgress();
        }

        @Override
        public void onPlayerError(androidx.media3.common.PlaybackException error) {
            JSObject payload = new JSObject();
            payload.put("message", error.getMessage() != null ? error.getMessage() : "Native playback failed");
            notifyListeners("error", payload);
        }
    };

    @PluginMethod
    public void open(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Playback URL is required");
            return;
        }

        String rawTitle = call.getString("title");
        if (rawTitle == null) {
            rawTitle = "";
        }
        final String subtitleUrl = call.getString("subtitleUrl");
        String rawSourceKey = call.getString("sourceKey");
        if (rawSourceKey == null || rawSourceKey.isEmpty()) {
            rawSourceKey = url;
        }
        final String title = rawTitle;
        final String sourceKey = rawSourceKey;
        final Long startPositionMsValue = call.getLong("startPositionMs");
        final long startPositionMs = startPositionMsValue != null ? Math.max(0L, startPositionMsValue) : 0L;

        getActivity().runOnUiThread(() -> {
            try {
                ensureOverlay();
                releasePlayer();

                player = new ExoPlayer.Builder(getContext()).build();
                mediaSession = new MediaSession.Builder(getContext(), player).setId("3d-movis-player").build();
                player.addListener(playerListener);

                MediaItem.Builder itemBuilder = new MediaItem.Builder()
                    .setMediaId(sourceKey)
                    .setUri(Uri.parse(url));

                if (subtitleUrl != null && !subtitleUrl.isEmpty()) {
                    MediaItem.SubtitleConfiguration subtitleConfig =
                        new MediaItem.SubtitleConfiguration.Builder(Uri.parse(subtitleUrl))
                            .setMimeType(MimeTypes.TEXT_VTT)
                            .setLanguage("he")
                            .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                            .build();
                    itemBuilder.setSubtitleConfigurations(Collections.singletonList(subtitleConfig));
                }

                titleView.setText(title);
                playerView.setPlayer(player);
                overlayRoot.setVisibility(View.VISIBLE);
                overlayRoot.bringToFront();

                player.setMediaItem(itemBuilder.build());
                player.prepare();
                if (startPositionMs > 0L) {
                    player.seekTo(startPositionMs);
                }
                player.play();
                playerView.requestFocus();
                startProgressUpdates();
                call.resolve();
            } catch (Exception exception) {
                call.reject("Failed to open native player: " + exception.getMessage(), exception);
            }
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            releasePlayer();
            if (overlayRoot != null) {
                overlayRoot.setVisibility(View.GONE);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void updateAutoplayOverlay(PluginCall call) {
        final Boolean visibleValue = call.getBoolean("visible");
        final boolean visible = visibleValue != null && visibleValue;
        String rawTitle = call.getString("title");
        if (rawTitle == null) {
            rawTitle = "";
        }
        final Integer remainingSecondsValue = call.getInt("remainingSeconds");
        final int remainingSeconds = remainingSecondsValue != null ? Math.max(0, remainingSecondsValue) : 0;
        final String title = rawTitle;

        getActivity().runOnUiThread(() -> {
            ensureOverlay();
            if (visible) {
                autoplayTitleView.setText(title);
                autoplayCountdownView.setText("Starts in " + remainingSeconds + "s");
                autoplayOverlay.setVisibility(View.VISIBLE);
                autoplayDismissButton.requestFocus();
            } else {
                autoplayOverlay.setVisibility(View.GONE);
                if (playerView != null) {
                    playerView.requestFocus();
                }
            }
            call.resolve();
        });
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (player != null) {
            emitProgress();
            player.pause();
        }
    }

    @Override
    protected void handleOnDestroy() {
        releasePlayer();
        if (overlayRoot != null) {
            ViewGroup parent = (ViewGroup) overlayRoot.getParent();
            if (parent != null) {
                parent.removeView(overlayRoot);
            }
            overlayRoot = null;
        }
        super.handleOnDestroy();
    }

    private void ensureOverlay() {
        if (overlayRoot != null) {
            return;
        }

        overlayRoot = new FrameLayout(getContext());
        overlayRoot.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        overlayRoot.setBackgroundColor(Color.BLACK);
        overlayRoot.setVisibility(View.GONE);
        overlayRoot.setFocusable(true);
        overlayRoot.setFocusableInTouchMode(true);
        overlayRoot.setOnKeyListener((view, keyCode, event) -> {
            if (event.getAction() != KeyEvent.ACTION_UP) {
                return false;
            }
            if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE) {
                notifyListeners("backRequest", new JSObject());
                return true;
            }
            return false;
        });

        playerView = new PlayerView(getContext());
        playerView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        playerView.setUseController(true);
        playerView.setControllerAutoShow(true);
        playerView.setControllerShowTimeoutMs(3500);
        playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_NEVER);
        playerView.setKeepScreenOn(true);
        playerView.setFocusable(true);
        playerView.setFocusableInTouchMode(true);
        overlayRoot.addView(playerView);

        titleView = new TextView(getContext());
        FrameLayout.LayoutParams titleParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        titleParams.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        titleParams.topMargin = dp(26);
        titleView.setLayoutParams(titleParams);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(18f);
        titleView.setPadding(dp(18), dp(10), dp(18), dp(10));
        titleView.setBackground(makeRoundedBackground("#66000000", "#2200ffcc"));
        overlayRoot.addView(titleView);

        Button closeButton = new Button(getContext());
        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        closeParams.gravity = Gravity.TOP | Gravity.START;
        closeParams.topMargin = dp(24);
        closeParams.leftMargin = dp(24);
        closeButton.setLayoutParams(closeParams);
        closeButton.setText("Close");
        closeButton.setTextColor(Color.WHITE);
        closeButton.setAllCaps(false);
        closeButton.setFocusable(false);
        closeButton.setClickable(true);
        closeButton.setBackground(makeRoundedBackground("#88000000", "#3300ffcc"));
        closeButton.setOnClickListener((view) -> notifyListeners("backRequest", new JSObject()));
        overlayRoot.addView(closeButton);

        autoplayOverlay = new LinearLayout(getContext());
        autoplayOverlay.setOrientation(LinearLayout.VERTICAL);
        FrameLayout.LayoutParams autoplayParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        autoplayParams.gravity = Gravity.TOP | Gravity.END;
        autoplayParams.topMargin = dp(28);
        autoplayParams.rightMargin = dp(28);
        autoplayOverlay.setLayoutParams(autoplayParams);
        autoplayOverlay.setPadding(dp(18), dp(16), dp(18), dp(16));
        autoplayOverlay.setBackground(makeRoundedBackground("#66000000", "#2200ffcc"));
        autoplayOverlay.setVisibility(View.GONE);

        TextView autoplayLabel = new TextView(getContext());
        autoplayLabel.setText("Next episode ready");
        autoplayLabel.setTextColor(Color.parseColor("#99FFFFFF"));
        autoplayLabel.setTextSize(12f);
        autoplayOverlay.addView(autoplayLabel);

        autoplayTitleView = new TextView(getContext());
        autoplayTitleView.setTextColor(Color.WHITE);
        autoplayTitleView.setTextSize(18f);
        autoplayTitleView.setPadding(0, dp(6), 0, 0);
        autoplayOverlay.addView(autoplayTitleView);

        autoplayCountdownView = new TextView(getContext());
        autoplayCountdownView.setTextColor(Color.parseColor("#CCFFFFFF"));
        autoplayCountdownView.setTextSize(12f);
        autoplayCountdownView.setPadding(0, dp(4), 0, 0);
        autoplayOverlay.addView(autoplayCountdownView);

        autoplayDismissButton = new Button(getContext());
        autoplayDismissButton.setText("Not interested");
        autoplayDismissButton.setAllCaps(false);
        autoplayDismissButton.setTextColor(Color.WHITE);
        autoplayDismissButton.setBackground(makeRoundedBackground("#2200ffcc", "#5500ffcc"));
        autoplayDismissButton.setPadding(dp(14), dp(8), dp(14), dp(8));
        LinearLayout.LayoutParams dismissParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        dismissParams.topMargin = dp(12);
        autoplayDismissButton.setLayoutParams(dismissParams);
        autoplayDismissButton.setOnClickListener((view) -> notifyListeners("autoplayDismissed", new JSObject()));
        autoplayOverlay.addView(autoplayDismissButton);
        overlayRoot.addView(autoplayOverlay);

        ViewGroup rootView = (ViewGroup) getActivity().getWindow().getDecorView();
        rootView.addView(overlayRoot);
    }

    private void startProgressUpdates() {
        stopProgressUpdates();
        progressRunnable = new Runnable() {
            @Override
            public void run() {
                emitProgress();
                if (player != null) {
                    handler.postDelayed(this, 1000L);
                }
            }
        };
        handler.post(progressRunnable);
    }

    private void stopProgressUpdates() {
        if (progressRunnable != null) {
            handler.removeCallbacks(progressRunnable);
            progressRunnable = null;
        }
    }

    private void emitProgress() {
        if (player == null) {
            return;
        }
        JSObject payload = new JSObject();
        payload.put("positionMs", player.getCurrentPosition());
        payload.put("durationMs", Math.max(0L, player.getDuration()));
        payload.put("bufferedPositionMs", Math.max(0L, player.getBufferedPosition()));
        payload.put("playbackState", player.getPlaybackState());
        payload.put("isPlaying", player.isPlaying());
        notifyListeners("progress", payload);
    }

    private void releasePlayer() {
        stopProgressUpdates();
        if (playerView != null) {
            playerView.setPlayer(null);
        }
        if (player != null) {
            player.removeListener(playerListener);
            player.stop();
            player.release();
            player = null;
        }
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        if (autoplayOverlay != null) {
            autoplayOverlay.setVisibility(View.GONE);
        }
    }

    private GradientDrawable makeRoundedBackground(String fillColor, String strokeColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(Color.parseColor(fillColor));
        drawable.setCornerRadius(dp(22));
        drawable.setStroke(dp(1), Color.parseColor(strokeColor));
        return drawable;
    }

    private int dp(int value) {
        float density = getContext().getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }
}
