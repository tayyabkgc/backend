const Setting = require('../models/setting.model');

const getSettingWithKey = async(value) => {
  const setting = await Setting.findOne({ key: value });
  return setting?.value;
};

module.exports = {
    getSettingWithKey
}
