#import <Capacitor/Capacitor.h>

CAP_PLUGIN(NativeServicesPlugin, "NativeServices",
    CAP_PLUGIN_METHOD(authenticateGameCenter, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(isGameCenterAuthenticated, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(submitScore, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(reportAchievement, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(showLeaderboard, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(showAchievements, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(cloudSetSave, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(cloudGetSave, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(cloudRemoveSave, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(cloudListKeys, CAPPluginReturnPromise);
)
