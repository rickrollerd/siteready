// SiteReady Native Features Implementation
// Camera, GPS, Offline Storage for Mobile App

class SiteReadyNativeFeatures {
  constructor() {
    this.isNative = typeof Capacitor !== 'undefined';
    this.init();
  }

  async init() {
    if (!this.isNative) {
      console.log('Running in browser mode - using fallback APIs');
      return;
    }

    console.log('Native Capacitor features available');
    
    // Initialize plugins
    await this.initCamera();
    await this.initGPS();
    await this.initStorage();
    await this.initNotifications();
  }

  // ===================== CAMERA =====================
  async initCamera() {
    if (!this.isNative) return;
    
    try {
      const { Camera } = await import('@capacitor/camera');
      this.Camera = Camera;
      console.log('Camera plugin ready');
    } catch (error) {
      console.error('Camera plugin failed:', error);
    }
  }

  async takeSitePhoto() {
    if (!this.isNative || !this.Camera) {
      // Fallback to file input
      return this.takePhotoFallback();
    }

    try {
      const image = await this.Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: 'base64',
        source: 'CAMERA',
        direction: 'BACK'
      });

      // Save to device storage
      await this.savePhotoToStorage(image.base64String);
      
      return {
        success: true,
        image: image.base64String,
        format: image.format,
        message: 'Photo captured successfully'
      };
    } catch (error) {
      console.error('Camera error:', error);
      return {
        success: false,
        error: error.message,
        fallback: await this.takePhotoFallback()
      };
    }
  }

  async takePhotoFallback() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            resolve({
              success: true,
              image: event.target.result,
              format: 'file',
              message: 'Photo uploaded via file input'
            });
          };
          reader.readAsDataURL(file);
        }
      };
      
      input.click();
    });
  }

  // ===================== GPS LOCATION =====================
  async initGPS() {
    if (!this.isNative) return;
    
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      this.Geolocation = Geolocation;
      
      // Request permissions
      await Geolocation.requestPermissions();
      console.log('GPS plugin ready');
    } catch (error) {
      console.error('GPS plugin failed:', error);
    }
  }

  async getSiteLocation() {
    if (!this.isNative || !this.Geolocation) {
      // Fallback to browser geolocation
      return this.getLocationFallback();
    }

    try {
      const coordinates = await this.Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000
      });

      const location = {
        latitude: coordinates.coords.latitude,
        longitude: coordinates.coords.longitude,
        accuracy: coordinates.coords.accuracy,
        timestamp: coordinates.timestamp
      };

      // Save to SWMS data
      await this.saveLocationToSWMS(location);
      
      return {
        success: true,
        location,
        message: 'Location captured successfully'
      };
    } catch (error) {
      console.error('GPS error:', error);
      return {
        success: false,
        error: error.message,
        fallback: await this.getLocationFallback()
      };
    }
  }

  async getLocationFallback() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({
          success: false,
          error: 'Geolocation not supported',
          location: null
        });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            success: true,
            location: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy
            },
            message: 'Location from browser geolocation'
          });
        },
        (error) => {
          resolve({
            success: false,
            error: error.message,
            location: null
          });
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  // ===================== OFFLINE STORAGE =====================
  async initStorage() {
    if (!this.isNative) return;
    
    try {
      const { Preferences } = await import('@capacitor/preferences');
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      
      this.Preferences = Preferences;
      this.Filesystem = Filesystem;
      this.Directory = Directory;
      
      console.log('Storage plugins ready');
    } catch (error) {
      console.error('Storage plugins failed:', error);
    }
  }

  async saveSWMSOffline(swmsData) {
    const timestamp = new Date().toISOString();
    const swmsId = `swms_${Date.now()}`;
    
    try {
      // Save to Preferences (small data)
      await this.Preferences.set({
        key: swmsId,
        value: JSON.stringify({
          ...swmsData,
          savedAt: timestamp,
          offline: true
        })
      });

      // Save to Filesystem (larger data, photos)
      if (this.Filesystem) {
        await this.Filesystem.writeFile({
          path: `swms/${swmsId}.json`,
          data: JSON.stringify(swmsData, null, 2),
          directory: this.Directory.Data,
          encoding: 'utf8'
        });
      }

      console.log('SWMS saved offline:', swmsId);
      return { success: true, id: swmsId, timestamp };
    } catch (error) {
      console.error('Offline save error:', error);
      
      // Fallback to localStorage
      try {
        localStorage.setItem(swmsId, JSON.stringify(swmsData));
        return { success: true, id: swmsId, timestamp, fallback: true };
      } catch (fallbackError) {
        return { success: false, error: fallbackError.message };
      }
    }
  }

  async getOfflineSWMS() {
    try {
      if (this.Preferences) {
        const { keys } = await this.Preferences.keys();
        const swmsList = [];
        
        for (const key of keys) {
          if (key.startsWith('swms_')) {
            const { value } = await this.Preferences.get({ key });
            if (value) {
              swmsList.push(JSON.parse(value));
            }
          }
        }
        
        return { success: true, swms: swmsList };
      } else {
        // Fallback to localStorage
        const swmsList = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key.startsWith('swms_')) {
            swmsList.push(JSON.parse(localStorage.getItem(key)));
          }
        }
        return { success: true, swms: swmsList, fallback: true };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ===================== NOTIFICATIONS =====================
  async initNotifications() {
    if (!this.isNative) return;
    
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      this.PushNotifications = PushNotifications;
      
      // Request permission
      const { receive } = await PushNotifications.requestPermissions();
      if (receive === 'granted') {
        await PushNotifications.register();
        console.log('Push notifications ready');
      }
    } catch (error) {
      console.error('Notifications plugin failed:', error);
    }
  }

  async sendSWMSReminder(swmsId, reminderTime) {
    if (!this.isNative || !this.PushNotifications) return;
    
    // This would integrate with a push notification service
    // For now, just log the intent
    console.log('SWMS reminder scheduled:', { swmsId, reminderTime });
    
    return { success: true, scheduled: true };
  }

  // ===================== UTILITY FUNCTIONS =====================
  async savePhotoToStorage(base64Image) {
    if (!this.isNative || !this.Filesystem) {
      // Fallback to localStorage (limited)
      const photoId = `photo_${Date.now()}`;
      localStorage.setItem(photoId, base64Image);
      return { success: true, id: photoId, fallback: true };
    }

    try {
      const photoId = `photo_${Date.now()}.jpg`;
      await this.Filesystem.writeFile({
        path: `photos/${photoId}`,
        data: base64Image,
        directory: this.Directory.Data,
        encoding: 'base64'
      });
      
      return { success: true, id: photoId };
    } catch (error) {
      console.error('Photo save error:', error);
      return { success: false, error: error.message };
    }
  }

  async saveLocationToSWMS(location) {
    // Save location to current SWMS in progress
    const currentSWMS = this.getCurrentSWMS() || {};
    currentSWMS.location = location;
    this.saveCurrentSWMS(currentSWMS);
    
    return { success: true };
  }

  getCurrentSWMS() {
    return JSON.parse(sessionStorage.getItem('current_swms') || '{}');
  }

  saveCurrentSWMS(swmsData) {
    sessionStorage.setItem('current_swms', JSON.stringify(swmsData));
  }

  // ===================== PUBLIC API =====================
  getNativeStatus() {
    return {
      isNative: this.isNative,
      features: {
        camera: !!this.Camera,
        gps: !!this.Geolocation,
        storage: !!(this.Preferences && this.Filesystem),
        notifications: !!this.PushNotifications
      },
      appMode: this.isNative ? 'Native App' : 'Web/PWA'
    };
  }
}

// Initialize and export
const siteReadyNative = new SiteReadyNativeFeatures();
window.siteReadyNative = siteReadyNative;

export default siteReadyNative;