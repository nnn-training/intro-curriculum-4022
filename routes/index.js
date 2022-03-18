'use strict';
const express = require('express');
const router = express.Router();
const Schedule = require('../models/schedule');

//Day.jsの読み込みとUTC表示するための設定
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

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
      //リクエストユーザが作成した予定をデータベースから取得したら、以下のタイムゾーンとフォーマットの更新日時で表示する
      schedules.forEach((schedule) => {
        schedule.formattedUpdatedAt = dayjs(schedule.updatedAt).tz('Asia/Tokyo').format('YYYY/MM/DD HH:mm');
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
