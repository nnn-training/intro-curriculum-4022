'use strict';
const express = require('express');
const router = express.Router();
const Schedule = require('../models/schedule');

const daysjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
daysjs.extend(utc);
daysjs.extend(timezone);

/* GET home page. */
router.get('/', async (req, res, next) => {
  const title = '予定調整くん';
  if (req.user) {
    const schedules = await Schedule.findAll({
      where: {
        createdBy: req.user.id
      },
      order: [['updatedAt', 'DESC']]
    });
    schedules.forEach((schedule) => {
      schedule.formattedUpdatedAt = daysjs(schedule.updatedAt).tz('Asia/Tokyo').format('YYYY年MM月DD日 HH時mm分ss秒');
    });
    res.render('index', {
      title: title,
      user: req.user,
      schedules: schedules
    });
  } else {
    res.render('index', { title: title, user: req.user });
  }
});

module.exports = router;
