'use strict';
const express = require('express');
const router = express.Router();
const Schedule = require('../models/schedule');

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezome = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezome);

/* GET home page. */
router.get('/', (req, res, next) => {
  const title = '予定調整くん';
  if (req.user) {
    Schedule.findAll({
      where: {
        createdBy: req.user.id
      },
      order: [['updatedAt', 'DESC']]
    }).then((schedules) => {
      schedules.forEach((schedule) => {
        schedule.formattedUpdatedAt = dayjs(schedule.formattedAt).tz('Asia/Tokyo').format('YYYY/MM/DD HH:mm');
      })
      res.render('index', {
        title: title,
        user: req.user,
        schedules: schedules
      });
    });
  } else {
    res.render('index', { title: title, user: req.user });
  }
});

module.exports = router;
