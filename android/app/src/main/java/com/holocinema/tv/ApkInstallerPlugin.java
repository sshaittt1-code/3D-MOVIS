package com.holocinema.tv;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;
import java.io.File;

import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PluginCall;

@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {
    @PluginMethod
    public void getInstallPermissionStatus(PluginCall call) {
        JSObject result = new JSObject();
        boolean canInstall = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
        result.put("canInstall", canInstall);
        result.put("needsPermission", !canInstall);
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException ex) {
            call.reject("Unable to open install permission settings: " + ex.getMessage());
        }
    }

    @PluginMethod
    public void verifyPackageArchive(PluginCall call) {
        String filePath = call.getString("filePath");
        String expectedPackageName = call.getString("packageName");
        Long expectedSizeBytes = call.getLong("expectedSizeBytes");

        if (filePath == null) {
          call.reject("Must provide filePath");
          return;
        }

        try {
            File file = toFile(filePath);
            JSObject result = new JSObject();
            result.put("exists", file.exists());
            result.put("sizeBytes", file.exists() ? file.length() : 0);
            result.put("matchesPackage", false);
            result.put("isApk", false);

            if (!file.exists()) {
                call.resolve(result);
                return;
            }

            if (expectedSizeBytes != null && expectedSizeBytes > 0 && file.length() != expectedSizeBytes) {
                call.resolve(result);
                return;
            }

            PackageManager packageManager = getContext().getPackageManager();
            PackageInfo packageInfo;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                packageInfo = packageManager.getPackageArchiveInfo(
                    file.getAbsolutePath(),
                    PackageManager.PackageInfoFlags.of(0)
                );
            } else {
                packageInfo = packageManager.getPackageArchiveInfo(file.getAbsolutePath(), 0);
            }

            if (packageInfo == null) {
                call.resolve(result);
                return;
            }

            String packageName = packageInfo.packageName;
            long versionCode = PackageInfoCompat.getLongVersionCode(packageInfo);
            String versionName = packageInfo.versionName;

            result.put("isApk", true);
            result.put("packageName", packageName);
            result.put("versionName", versionName);
            result.put("versionCode", versionCode);
            result.put("matchesPackage", expectedPackageName == null || expectedPackageName.equals(packageName));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to verify APK: " + e.getMessage());
        }
    }

    @PluginMethod
    public void install(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null) {
            call.reject("Must provide filePath");
            return;
        }

        try {
            File file = toFile(filePath);
            
            if (!file.exists()) {
                call.reject("File does not exist: " + file.getAbsolutePath());
                return;
            }

            Intent intent = new Intent(Intent.ACTION_VIEW);
            Uri apkUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                file
            );

            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to install APK: " + e.getMessage());
        }
    }

    private File toFile(String filePath) {
        String cleanPath = filePath.replace("file://", "");
        return new File(cleanPath);
    }
}
