# Source this before building: `. android/dev-env.sh && gradle -p android assembleDebug`
# Defaults match a ~/devtools layout; override any of these in your environment.
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/devtools/android-sdk}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$HOME/devtools/gradle-home}"
GRADLE_BIN="${GRADLE_BIN:-$HOME/devtools/gradle-8.9/bin}"
export PATH="$JAVA_HOME/bin:$GRADLE_BIN:$ANDROID_HOME/platform-tools:$PATH"
# Java ignores HTTPS_PROXY; pass an authenticated proxy (e.g. a sandbox's) through to it.
if [ -n "$HTTPS_PROXY" ]; then
  export JAVA_TOOL_OPTIONS="$(python3 -c "
import os,urllib.parse as u
p=u.urlparse(os.environ['HTTPS_PROXY'])
o=['-Dhttps.proxyHost=%s'%p.hostname,'-Dhttps.proxyPort=%s'%p.port,'-Djdk.http.auth.tunneling.disabledSchemes=']
if p.username: o+=['-Dhttps.proxyUser=%s'%u.unquote(p.username),'-Dhttps.proxyPassword=%s'%u.unquote(p.password or '')]
print(' '.join(o))")"
fi
# Keep Java's temp files in $TMPDIR (some sandboxes make /tmp read-only).
[ -n "$TMPDIR" ] && export JAVA_TOOL_OPTIONS="$JAVA_TOOL_OPTIONS -Djava.io.tmpdir=$TMPDIR"
