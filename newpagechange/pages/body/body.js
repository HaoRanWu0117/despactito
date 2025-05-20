// body.js
const app = getApp();

Page({
  data: {
    bodyData: {
      temperature: '36.5',
      oxygen: '98',
      heartRate: '75',
      respRate: '16'
    },
    ranges: {
      temperature: { min: 36, max: 37.3, unit: '℃', description: '安全范围 36-37.3℃' },
      oxygen: { min: 95, max: 100, unit: '%', description: '安全范围 95-100%' },
      heartRate: { min: 60, max: 100, unit: 'bpm', description: '安全范围 60-100 bpm' },
      respRate: { min: 12, max: 20, unit: '次/分', description: '安全范围 12-20 次/分' }
    },
    warnings: {
      temperature: false,
      oxygen: false,
      heartRate: false,
      respRate: false
    },
    lastWarningTime: 0,
    updateTimestamp: Date.now(),
    isPlaying: false // 新增：标记音频是否正在播放
  },

  onLoad: function () {
    // 初始化音频上下文
    this.audioCtx = wx.createInnerAudioContext();
    this.audioCtx.src = '/audio/temperature_warning.mp3';

    // 监听音频播放结束
    this.audioCtx.onEnded(() => {
      this.setData({ isPlaying: false });
      // 音频播放结束后，检查是否需要5秒后再次播放
      if (this.data.warnings.temperature) {
        this.scheduleNextWarning();
      }
    });

    // 监听音频播放错误
    this.audioCtx.onError((res) => {
      console.error('体温预警音频播放错误:', res);
      this.setData({ isPlaying: false });
      // 即使出错，也尝试5秒后重新播放（如果仍异常）
      if (this.data.warnings.temperature) {
        this.scheduleNextWarning();
      }
    });
  },

  onShow: function () {},

  onHide: function () {
    // 清除定时器
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
  },

  onUnload: function () {
    // 清除定时器
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
    // 销毁音频上下文
    if (this.audioCtx) {
      this.audioCtx.destroy();
    }
  },

  // 播放体温预警音频
  playTemperatureWarning: function () {
    if (this.data.isPlaying) {
      console.log('音频正在播放，跳过');
      return;
    }

    this.setData({ isPlaying: true });
    this.audioCtx.play();
  },

  // 安排下一次预警（5秒后）
  scheduleNextWarning: function () {
    // 清除已有定时器
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
    }
    // 设置5秒后检查
    this.warningTimer = setTimeout(() => {
      if (this.data.warnings.temperature && !this.data.isPlaying) {
        this.playTemperatureWarning();
      }
    }, 5000);
  },

  handleMQTTData: function (e) {
    try {
      const message = e.detail.message;
      console.log('[MQTT] 收到消息:', message);
      const data = JSON.parse(message);
      let newBodyData = { ...this.data.bodyData };
      let newWarnings = { ...this.data.warnings };
      let needUpdate = false;
      const now = Date.now();

      if (data.body_temp !== undefined) {
        const value = parseFloat(data.body_temp);
        newBodyData.temperature = value.toFixed(1);
        newWarnings.temperature = value < this.data.ranges.temperature.min || value > this.data.ranges.temperature.max;
        // 体温异常时触发语音预警
        if (newWarnings.temperature && !this.data.isPlaying && now - this.data.lastWarningTime > 5000) {
          this.playTemperatureWarning();
          this.setData({ lastWarningTime: now });
        }
        // 如果体温恢复正常，清除定时器
        if (!newWarnings.temperature && this.warningTimer) {
          clearTimeout(this.warningTimer);
          this.warningTimer = null;
        }
        needUpdate = true;
      }

      if (data.blood_oxygen !== undefined) {
        const value = parseInt(data.blood_oxygen);
        newBodyData.oxygen = value.toString();
        newWarnings.oxygen = value < this.data.ranges.oxygen.min || value > this.data.ranges.oxygen.max;
        needUpdate = true;
      }

      if (data.heart_rate !== undefined) {
        const value = parseInt(data.heart_rate);
        newBodyData.heartRate = value.toString();
        newWarnings.heartRate = value < this.data.ranges.heartRate.min || value > this.data.ranges.heartRate.max;
        needUpdate = true;
      }

      if (data.respiration_rate !== undefined) {
        const value = parseInt(data.respiration_rate);
        newBodyData.respRate = value.toString();
        newWarnings.respRate = value < this.data.ranges.respRate.min || value > this.data.ranges.respRate.max;
        needUpdate = true;
      }

      if (needUpdate) {
        this.setData({
          bodyData: newBodyData,
          warnings: newWarnings,
          updateTimestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('[MQTT] 解析数据错误:', error);
    }
  }
});