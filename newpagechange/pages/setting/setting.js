// pages/setting/setting.js
const app = getApp();

Component({
  properties: {},
  data: {
    isConnected: false,
    mqttConfig: {},
    sensorTopic: '',
    warningTopic: '',
    topicsChanged: false
  },
  lifetimes: {
    attached: function () {
      this.setData({
        mqttConfig: app.globalData.mqttConfig,
        sensorTopic: app.globalData.mqttConfig.sensorTopic,
        warningTopic: app.globalData.mqttConfig.warningTopic
      });
      this.checkMqttStatus();
    }
  },
  pageLifetimes: {
    show: function () {
      this.checkMqttStatus();
      this.statusInterval = setInterval(() => {
        this.checkMqttStatus();
      }, 5000);
    },
    hide: function () {
      if (this.statusInterval) {
        clearInterval(this.statusInterval);
        this.statusInterval = null;
      }
    }
  },
  methods: {
    checkMqttStatus: function () {
      this.setData({
        isConnected: app.globalData.mqttConnected
      });
    },
    connectMqtt: function () {
      app.connectMqtt();
      wx.showToast({
        title: '正在连接...',
        icon: 'loading'
      });
    },
    disconnectMqtt: function () {
      app.disconnectMqtt();
      this.setData({
        isConnected: false
      });
      wx.showToast({
        title: '已断开',
        icon: 'success'
      });
    },
    inputSensorTopic: function (e) {
      this.setData({
        sensorTopic: e.detail.value,
        topicsChanged: true
      });
    },
    inputWarningTopic: function (e) {
      this.setData({
        warningTopic: e.detail.value,
        topicsChanged: true
      });
    },
    changeTopics: function () {
      if (!this.data.sensorTopic || !this.data.warningTopic) {
        wx.showToast({
          title: '请输入所有主题',
          icon: 'none'
        });
        return;
      }
      // 更新全局主题
      app.globalData.mqttConfig.sensorTopic = this.data.sensorTopic;
      app.globalData.mqttConfig.warningTopic = this.data.warningTopic;
      this.setData({
        mqttConfig: app.globalData.mqttConfig,
        topicsChanged: false
      });
      // 如果已连接 MQTT，重新订阅所有主题
      if (app.globalData.mqttClient && app.globalData.mqttConnected) {
        // 先取消所有现有订阅
        const topics = [app.globalData.mqttConfig.sensorTopic, app.globalData.mqttConfig.warningTopic];
        app.globalData.mqttClient.unsubscribe(topics, (err) => {
          if (err) {
            console.error('取消订阅失败:', err);
          }
        });
        // 订阅新主题
        topics.forEach(topic => {
          app.globalData.mqttClient.subscribe(topic, { qos: 0 }, (err) => {
            if (!err) {
              console.log('订阅主题成功:', topic);
              wx.showToast({
                title: '主题更改成功',
                icon: 'success'
              });
            } else {
              console.error('订阅主题失败:', topic, err);
              wx.showToast({
                title: '主题更改失败',
                icon: 'none'
              });
            }
          });
        });
      }
    },
    resetTopics: function () {
      this.setData({
        sensorTopic: '/wechat_ros/sensor_data',
        warningTopic: '/wechat_ros/warning_data',
        topicsChanged: false
      });
      // 更新全局主题
      app.globalData.mqttConfig.sensorTopic = this.data.sensorTopic;
      app.globalData.mqttConfig.warningTopic = this.data.warningTopic;
      // 如果已连接 MQTT，重新订阅默认主题
      if (app.globalData.mqttClient && app.globalData.mqttConnected) {
        const topics = [app.globalData.mqttConfig.sensorTopic, app.globalData.mqttConfig.warningTopic];
        app.globalData.mqttClient.unsubscribe(topics, (err) => {
          if (err) {
            console.error('取消订阅失败:', err);
          }
        });
        topics.forEach(topic => {
          app.globalData.mqttClient.subscribe(topic, { qos: 0 }, (err) => {
            if (!err) {
              console.log('订阅默认主题成功:', topic);
              wx.showToast({
                title: '主题重置成功',
                icon: 'success'
              });
            } else {
              console.error('订阅默认主题失败:', topic, err);
              wx.showToast({
                title: '主题重置失败',
                icon: 'none'
              });
            }
          });
        });
      }
    }
  }
});