# R8 runs with the optimized Android defaults (proguard-android-optimize.txt).
# The page calls window.STAndroid.saveFile(...) by name, so R8 must not rename, inline or remove
# @JavascriptInterface methods (MainActivity.Bridge). Without this the export silently stops working.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
