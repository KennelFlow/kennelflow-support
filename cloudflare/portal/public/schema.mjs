// Fields and enum values follow the existing app Codable models.
export const models = {
  "Dog": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "name",
      "type": "String",
      "optional": false
    },
    {
      "key": "registeredName",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "breed",
      "type": "String",
      "optional": false
    },
    {
      "key": "sex",
      "type": "String",
      "optional": false
    },
    {
      "key": "dateOfBirth",
      "type": "Date",
      "optional": false
    },
    {
      "key": "color",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "coat",
      "type": "String",
      "optional": true
    },
    {
      "key": "registrationOrganization",
      "type": "String",
      "optional": true
    },
    {
      "key": "registrationNumber",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "secondaryRegistrationOrganization",
      "type": "String",
      "optional": true
    },
    {
      "key": "secondaryRegistrationNumber",
      "type": "String",
      "optional": true
    },
    {
      "key": "linkedLitterIDs",
      "type": "[UUID]",
      "optional": true
    },
    {
      "key": "microchipNumber",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "credentials",
      "type": "[DogCredential]",
      "optional": true
    },
    {
      "key": "status",
      "type": "DogStatus",
      "optional": false,
      "options": [
        "Active",
        "Sold",
        "Retired",
        "Deceased"
      ],
      "default": "Active"
    },
    {
      "key": "sire",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "dam",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "DogCredential": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "organization",
      "type": "String",
      "optional": false
    },
    {
      "key": "category",
      "type": "String",
      "optional": false
    },
    {
      "key": "title",
      "type": "String",
      "optional": false
    },
    {
      "key": "abbreviation",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "dateEarned",
      "type": "Date",
      "optional": true
    },
    {
      "key": "expirationDate",
      "type": "Date",
      "optional": true
    },
    {
      "key": "certificateNumber",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "issuingAgency",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "prefixOrSuffix",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "selectedTargets",
      "type": "[String]",
      "optional": true
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "Litter": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "name",
      "type": "String",
      "optional": false
    },
    {
      "key": "breed",
      "type": "String",
      "optional": true
    },
    {
      "key": "sire",
      "type": "String",
      "optional": false
    },
    {
      "key": "dam",
      "type": "String",
      "optional": false
    },
    {
      "key": "breedingDate",
      "type": "Date",
      "optional": false
    },
    {
      "key": "dueDate",
      "type": "Date",
      "optional": false
    },
    {
      "key": "whelpDate",
      "type": "Date",
      "optional": true
    },
    {
      "key": "puppyCount",
      "type": "Int",
      "optional": false,
      "default": 0
    },
    {
      "key": "availableCount",
      "type": "Int",
      "optional": false,
      "default": 0
    },
    {
      "key": "litterRegistrationOrganization",
      "type": "String",
      "optional": true
    },
    {
      "key": "litterRegistrationNumber",
      "type": "String",
      "optional": true
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "HealthRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "dogName",
      "type": "String",
      "optional": false
    },
    {
      "key": "date",
      "type": "Date",
      "optional": false
    },
    {
      "key": "category",
      "type": "String",
      "optional": false
    },
    {
      "key": "detail",
      "type": "String",
      "optional": false
    },
    {
      "key": "nextDue",
      "type": "Date",
      "optional": true
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "Customer": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "name",
      "type": "String",
      "optional": false
    },
    {
      "key": "phone",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "email",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "puppy",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "totalPrice",
      "type": "Double",
      "optional": false,
      "default": 0
    },
    {
      "key": "paid",
      "type": "Double",
      "optional": false,
      "default": 0
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "KennelTask": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "title",
      "type": "String",
      "optional": false
    },
    {
      "key": "dueDate",
      "type": "Date",
      "optional": false
    },
    {
      "key": "category",
      "type": "String",
      "optional": false
    },
    {
      "key": "assignedTo",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "completed",
      "type": "Bool",
      "optional": false,
      "default": false
    }
  ],
  "TrainingRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "dogName",
      "type": "String",
      "optional": false
    },
    {
      "key": "date",
      "type": "Date",
      "optional": false
    },
    {
      "key": "type",
      "type": "String",
      "optional": false
    },
    {
      "key": "durationMinutes",
      "type": "Int",
      "optional": false,
      "default": 30
    },
    {
      "key": "location",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "rating",
      "type": "Int",
      "optional": false,
      "default": 3
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "EquipmentItem": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "name",
      "type": "String",
      "optional": false
    },
    {
      "key": "category",
      "type": "String",
      "optional": false
    },
    {
      "key": "quantity",
      "type": "Int",
      "optional": false,
      "default": 1
    },
    {
      "key": "condition",
      "type": "String",
      "optional": false,
      "default": "Good"
    },
    {
      "key": "needsReplacement",
      "type": "Bool",
      "optional": false,
      "default": false
    },
    {
      "key": "lastChecked",
      "type": "Date",
      "optional": false,
      "default": "$now"
    }
  ],
  "KennelRun": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "name",
      "type": "String",
      "optional": false
    },
    {
      "key": "assignedDog",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "needsMaintenance",
      "type": "Bool",
      "optional": false,
      "default": false
    },
    {
      "key": "externalQRPayload",
      "type": "String",
      "optional": true
    }
  ],
  "Puppy": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "litterID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "litterName",
      "type": "String",
      "optional": false
    },
    {
      "key": "callName",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "registeredName",
      "type": "String",
      "optional": true
    },
    {
      "key": "sex",
      "type": "String",
      "optional": false
    },
    {
      "key": "color",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "dateOfBirth",
      "type": "Date",
      "optional": false
    },
    {
      "key": "collarColor",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "microchipNumber",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "registrationOrganization",
      "type": "String",
      "optional": true
    },
    {
      "key": "registrationNumber",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "status",
      "type": "PuppyStatus",
      "optional": false,
      "options": [
        "Available",
        "Reserved",
        "Sold",
        "Retained"
      ],
      "default": "Available"
    },
    {
      "key": "buyerName",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "askingPrice",
      "type": "Double",
      "optional": false,
      "default": 0
    },
    {
      "key": "depositPaid",
      "type": "Double",
      "optional": false,
      "default": 0
    },
    {
      "key": "balancePaid",
      "type": "Double",
      "optional": false,
      "default": 0
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "PuppyMedicalRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "puppyID",
      "type": "UUID",
      "optional": false
    },
    {
      "key": "puppyName",
      "type": "String",
      "optional": false
    },
    {
      "key": "date",
      "type": "Date",
      "optional": false
    },
    {
      "key": "type",
      "type": "PuppyMedicalType",
      "optional": false,
      "options": [
        "Vaccine",
        "Wormer / Dewormer",
        "Vet Visit",
        "Medication",
        "Other"
      ]
    },
    {
      "key": "productName",
      "type": "String",
      "optional": false
    },
    {
      "key": "dose",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "lotOrSerial",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "administeredBy",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "nextDue",
      "type": "Date",
      "optional": true
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "BreedingRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "femaleName",
      "type": "String",
      "optional": false
    },
    {
      "key": "maleName",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "eventType",
      "type": "BreedingEventType",
      "optional": false,
      "options": [
        "Heat Cycle",
        "Breeding",
        "Progesterone Test",
        "Ovulation",
        "Pregnancy Check",
        "Ultrasound",
        "X-Ray",
        "Reproductive Exam",
        "Semen Evaluation",
        "Whelping"
      ]
    },
    {
      "key": "breedingMethod",
      "type": "BreedingMethod",
      "optional": true,
      "options": [
        "Live Breeding",
        "AI Breeding"
      ]
    },
    {
      "key": "date",
      "type": "Date",
      "optional": false
    },
    {
      "key": "value",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "estimatedDueDate",
      "type": "Date",
      "optional": true
    },
    {
      "key": "reminderDate",
      "type": "Date",
      "optional": true
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "DocumentRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "title",
      "type": "String",
      "optional": false
    },
    {
      "key": "kind",
      "type": "DocumentKind",
      "optional": false,
      "options": [
        "Photo",
        "Pedigree",
        "Registration",
        "Health Record",
        "Contract",
        "Receipt",
        "Other"
      ]
    },
    {
      "key": "linkedType",
      "type": "String",
      "optional": false
    },
    {
      "key": "linkedName",
      "type": "String",
      "optional": false
    },
    {
      "key": "fileName",
      "type": "String",
      "optional": false
    },
    {
      "key": "createdAt",
      "type": "Date",
      "optional": false,
      "default": "$now"
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "ContractRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "customerName",
      "type": "String",
      "optional": false
    },
    {
      "key": "puppyName",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "title",
      "type": "String",
      "optional": false,
      "default": "Puppy Purchase Agreement"
    },
    {
      "key": "createdAt",
      "type": "Date",
      "optional": false,
      "default": "$now"
    },
    {
      "key": "signedAt",
      "type": "Date",
      "optional": true
    },
    {
      "key": "status",
      "type": "ContractStatus",
      "optional": false,
      "options": [
        "Draft",
        "Sent",
        "Signed",
        "Completed"
      ],
      "default": "Draft"
    },
    {
      "key": "contractText",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "PaymentRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "customerName",
      "type": "String",
      "optional": false
    },
    {
      "key": "puppyName",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "date",
      "type": "Date",
      "optional": false,
      "default": "$now"
    },
    {
      "key": "amount",
      "type": "Double",
      "optional": false
    },
    {
      "key": "method",
      "type": "String",
      "optional": false,
      "default": "Cash"
    },
    {
      "key": "reference",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "GroomingRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "dogName",
      "type": "String",
      "optional": false
    },
    {
      "key": "date",
      "type": "Date",
      "optional": false
    },
    {
      "key": "service",
      "type": "GroomingService",
      "optional": false,
      "options": [
        "Bath",
        "Full Groom",
        "Brushing",
        "Nail Trim",
        "Ear Cleaning",
        "Teeth Cleaning",
        "Coat Trim",
        "De-Shedding",
        "Other"
      ]
    },
    {
      "key": "shampooOrProduct",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "groomer",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "nextDue",
      "type": "Date",
      "optional": true
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "FeedingPlan": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "subjectType",
      "type": "FeedingSubjectType",
      "optional": false,
      "options": [
        "Dog",
        "Puppy"
      ],
      "default": "Dog"
    },
    {
      "key": "subjectName",
      "type": "String",
      "optional": false
    },
    {
      "key": "planType",
      "type": "DietPlanType",
      "optional": false,
      "options": [
        "Commercial Feed",
        "RAW",
        "Mixed",
        "Homemade",
        "Prescription",
        "Other"
      ],
      "default": "Commercial Feed"
    },
    {
      "key": "foodBrand",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "foodFormula",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "cupsPerMeal",
      "type": "Double",
      "optional": false,
      "default": 0
    },
    {
      "key": "ouncesPerMeal",
      "type": "Double",
      "optional": false,
      "default": 0
    },
    {
      "key": "mealsPerDay",
      "type": "Int",
      "optional": false,
      "default": 2
    },
    {
      "key": "feedingTimes",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "dailyCalories",
      "type": "Int",
      "optional": false,
      "default": 0
    },
    {
      "key": "startDate",
      "type": "Date",
      "optional": false,
      "default": "$now"
    },
    {
      "key": "isActive",
      "type": "Bool",
      "optional": false,
      "default": true
    },
    {
      "key": "dietPlanNotes",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "rawProtein",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "rawProteinPercent",
      "type": "Double",
      "optional": false,
      "default": 0
    },
    {
      "key": "rawBonePercent",
      "type": "Double",
      "optional": false,
      "default": 0
    },
    {
      "key": "rawOrganPercent",
      "type": "Double",
      "optional": false,
      "default": 0
    },
    {
      "key": "rawProducePercent",
      "type": "Double",
      "optional": false,
      "default": 0
    },
    {
      "key": "supplements",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "transitionPlan",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "SupplementRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "subjectType",
      "type": "FeedingSubjectType",
      "optional": false,
      "options": [
        "Dog",
        "Puppy"
      ],
      "default": "Dog"
    },
    {
      "key": "subjectName",
      "type": "String",
      "optional": false
    },
    {
      "key": "supplementName",
      "type": "String",
      "optional": false
    },
    {
      "key": "brand",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "amount",
      "type": "Double",
      "optional": false,
      "default": 0
    },
    {
      "key": "unit",
      "type": "String",
      "optional": false,
      "default": "mg"
    },
    {
      "key": "frequency",
      "type": "String",
      "optional": false,
      "default": "Daily"
    },
    {
      "key": "purpose",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "startDate",
      "type": "Date",
      "optional": false,
      "default": "$now"
    },
    {
      "key": "nextDue",
      "type": "Date",
      "optional": true
    },
    {
      "key": "isActive",
      "type": "Bool",
      "optional": false,
      "default": true
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "SemenRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "dogName",
      "type": "String",
      "optional": false
    },
    {
      "key": "units",
      "type": "Int",
      "optional": false,
      "default": 1
    },
    {
      "key": "semenType",
      "type": "SemenType",
      "optional": false,
      "options": [
        "Fresh",
        "Chilled",
        "Frozen"
      ],
      "default": "Frozen"
    },
    {
      "key": "collectionDate",
      "type": "Date",
      "optional": false,
      "default": "$now"
    },
    {
      "key": "storageLocation",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "providerOrLab",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "ScanFolderRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "name",
      "type": "String",
      "optional": false
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "createdAt",
      "type": "Date",
      "optional": false,
      "default": "$now"
    }
  ],
  "ScannedReport": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "title",
      "type": "String",
      "optional": false
    },
    {
      "key": "folderID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "folderName",
      "type": "String",
      "optional": false
    },
    {
      "key": "fileName",
      "type": "String",
      "optional": false
    },
    {
      "key": "createdAt",
      "type": "Date",
      "optional": false,
      "default": "$now"
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "ClientRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "name",
      "type": "String",
      "optional": false
    },
    {
      "key": "phone",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "email",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "address",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "emergencyContact",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "emergencyPhone",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "BoardingRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "kennelNumber",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "petName",
      "type": "String",
      "optional": false
    },
    {
      "key": "clientID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "ownerName",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "ownerPhone",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "breed",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "sex",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "dateOfBirth",
      "type": "Date",
      "optional": true
    },
    {
      "key": "weight",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "emergencyContact",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "emergencyPhone",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "dropOffDate",
      "type": "Date",
      "optional": false
    },
    {
      "key": "pickupDate",
      "type": "Date",
      "optional": false
    },
    {
      "key": "dailyRate",
      "type": "Double",
      "optional": false,
      "default": 0
    },
    {
      "key": "totalCost",
      "type": "Double",
      "optional": false,
      "default": 0
    },
    {
      "key": "amountPaid",
      "type": "Double",
      "optional": false,
      "default": 0
    },
    {
      "key": "status",
      "type": "BoardingStatus",
      "optional": false,
      "options": [
        "Reserved",
        "Checked In",
        "Currently Boarding",
        "Checked Out",
        "Cancelled"
      ],
      "default": "Reserved"
    },
    {
      "key": "feedType",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "foodBrand",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "amountPerMeal",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "feedingSchedule",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "feedingInstructions",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "medications",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "medicationDose",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "medicationSchedule",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "exerciseSchedule",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "bathroomSchedule",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "behaviorNotes",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "specialCareInstructions",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "veterinarian",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "veterinarianPhone",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "KennelCalendarEvent": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "title",
      "type": "String",
      "optional": false
    },
    {
      "key": "startDate",
      "type": "Date",
      "optional": false
    },
    {
      "key": "endDate",
      "type": "Date",
      "optional": true
    },
    {
      "key": "allDay",
      "type": "Bool",
      "optional": false,
      "default": false
    },
    {
      "key": "category",
      "type": "CalendarEventCategory",
      "optional": false,
      "options": [
        "General",
        "Boarding",
        "Medication",
        "Feeding",
        "Health",
        "Breeding",
        "Litter / Puppy",
        "Training",
        "Kennel Duty",
        "Grooming",
        "Appointment",
        "Maintenance"
      ],
      "default": "General"
    },
    {
      "key": "highlight",
      "type": "CalendarHighlight",
      "optional": false,
      "options": [
        "None",
        "Red",
        "Orange",
        "Yellow",
        "Green",
        "Blue",
        "Purple"
      ],
      "default": "None"
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "reminderEnabled",
      "type": "Bool",
      "optional": false,
      "default": false
    },
    {
      "key": "reminderMinutesBefore",
      "type": "Int",
      "optional": false,
      "default": 30
    },
    {
      "key": "linkedType",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "linkedID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "recurrence",
      "type": "KFMaintenanceRepeat",
      "optional": true,
      "options": [
        "Does Not Repeat",
        "Daily",
        "Weekly",
        "Monthly",
        "Yearly"
      ]
    },
    {
      "key": "completedAt",
      "type": "Date",
      "optional": true
    },
    {
      "key": "nextOccurrenceID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "deletedAt",
      "type": "Date",
      "optional": true
    },
    {
      "key": "history",
      "type": "[KFCalendarChange]",
      "optional": true
    }
  ],
  "KFCalendarChange": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "date",
      "type": "Date",
      "optional": false,
      "default": "$now"
    },
    {
      "key": "action",
      "type": "String",
      "optional": false
    }
  ],
  "EmployeeActivityRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "staffID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "staffName",
      "type": "String",
      "optional": false
    },
    {
      "key": "timestamp",
      "type": "Date",
      "optional": false,
      "default": "$now"
    },
    {
      "key": "category",
      "type": "EmployeeActivityCategory",
      "optional": false,
      "options": [
        "Kennel",
        "Duty",
        "Feeding",
        "Medication",
        "Cleaning",
        "Water",
        "Exercise",
        "Boarding",
        "Health",
        "System"
      ]
    },
    {
      "key": "action",
      "type": "String",
      "optional": false
    },
    {
      "key": "kennelID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "kennelName",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "dogName",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "details",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "StaffTimeEntry": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "staffID",
      "type": "UUID",
      "optional": false
    },
    {
      "key": "staffName",
      "type": "String",
      "optional": false
    },
    {
      "key": "clockIn",
      "type": "Date",
      "optional": false,
      "default": "$now"
    },
    {
      "key": "clockOut",
      "type": "Date",
      "optional": true
    }
  ],
  "KennelCareSession": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "kennelID",
      "type": "UUID",
      "optional": false
    },
    {
      "key": "kennelName",
      "type": "String",
      "optional": false
    },
    {
      "key": "dogName",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "staffID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "staffName",
      "type": "String",
      "optional": false
    },
    {
      "key": "timestamp",
      "type": "Date",
      "optional": false,
      "default": "$now"
    },
    {
      "key": "shift",
      "type": "KennelCareShift",
      "optional": true,
      "options": [
        "Morning",
        "Afternoon",
        "Night"
      ]
    },
    {
      "key": "kennelCleaned",
      "type": "Bool",
      "optional": false,
      "default": false
    },
    {
      "key": "waterChanged",
      "type": "Bool",
      "optional": false,
      "default": false
    },
    {
      "key": "fed",
      "type": "Bool",
      "optional": false,
      "default": false
    },
    {
      "key": "medicationGiven",
      "type": "Bool",
      "optional": false,
      "default": false
    },
    {
      "key": "exerciseCompleted",
      "type": "Bool",
      "optional": false,
      "default": false
    },
    {
      "key": "bathroomBreak",
      "type": "Bool",
      "optional": false,
      "default": false
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "ExpenseRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "date",
      "type": "Date",
      "optional": false,
      "default": "$now"
    },
    {
      "key": "amount",
      "type": "Double",
      "optional": false,
      "default": 0
    },
    {
      "key": "category",
      "type": "ExpenseCategory",
      "optional": false,
      "options": [
        "Feed & Supplements",
        "Canine Equipment",
        "Maintenance & Repairs",
        "Monthly Bills",
        "Utilities",
        "Veterinary Expenses",
        "Medication Expenses",
        "Vaccination Expenses",
        "Wormer / Dewormer Expenses",
        "Kennel Equipment",
        "Canine Purchase Expenses",
        "Puppy Expenses",
        "Breeding Expenses",
        "Semen / Reproductive Services",
        "Boarding Expenses",
        "Training Expenses",
        "Grooming Expenses",
        "License / Certificate Expenses",
        "Registration / Organization Fees",
        "Insurance",
        "Fuel & Travel",
        "Shipping & Delivery",
        "Cleaning & Sanitation",
        "Office & Administrative Supplies",
        "Advertising & Marketing",
        "Software & Subscriptions",
        "Payroll / Employee Expenses",
        "Professional Services",
        "Taxes & Government Fees",
        "Building / Rent / Property",
        "Miscellaneous",
        "Custom Category"
      ],
      "default": "Feed & Supplements"
    },
    {
      "key": "customCategory",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "vendor",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "expenseDescription",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "paymentMethod",
      "type": "String",
      "optional": false,
      "default": "Cash"
    },
    {
      "key": "linkedDogID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "linkedDogName",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "linkedPuppyID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "linkedPuppyName",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "linkedLitterID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "linkedLitterName",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "DutyShiftCategory": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "name",
      "type": "String",
      "optional": false
    },
    {
      "key": "systemName",
      "type": "String",
      "optional": true
    }
  ],
  "DailyDutyTemplate": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "title",
      "type": "String",
      "optional": false
    },
    {
      "key": "shift",
      "type": "String",
      "optional": false
    }
  ],
  "DailyDutyRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "dateKey",
      "type": "String",
      "optional": false
    },
    {
      "key": "shift",
      "type": "String",
      "optional": false
    },
    {
      "key": "templateID",
      "type": "UUID",
      "optional": false
    },
    {
      "key": "taskTitle",
      "type": "String",
      "optional": false
    },
    {
      "key": "completed",
      "type": "Bool",
      "optional": false,
      "default": false
    },
    {
      "key": "completedAt",
      "type": "Date",
      "optional": true
    }
  ],
  "KFSmartTag": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "name",
      "type": "String",
      "optional": false
    },
    {
      "key": "placementID",
      "type": "UUID",
      "optional": false
    },
    {
      "key": "placementName",
      "type": "String",
      "optional": false
    },
    {
      "key": "accessory",
      "type": "String",
      "optional": false
    },
    {
      "key": "method",
      "type": "String",
      "optional": false
    },
    {
      "key": "linkedID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "dogID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "areaID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "locationName",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "externalQRPayload",
      "type": "String",
      "optional": true
    },
    {
      "key": "createdAt",
      "type": "Date",
      "optional": false,
      "default": "$now"
    }
  ],
  "KFInventoryLocation": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "name",
      "type": "String",
      "optional": false
    },
    {
      "key": "kind",
      "type": "String",
      "optional": false
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "KFInventoryItem": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "name",
      "type": "String",
      "optional": false
    },
    {
      "key": "quantity",
      "type": "Int",
      "optional": false,
      "default": 1
    },
    {
      "key": "containerTagID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "areaID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "checked",
      "type": "Bool",
      "optional": false,
      "default": false
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "KFTravelManifest": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "name",
      "type": "String",
      "optional": false
    },
    {
      "key": "vehicleAreaID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "entries",
      "type": "[KFTravelEntry]",
      "optional": false,
      "default": []
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "createdAt",
      "type": "Date",
      "optional": false,
      "default": "$now"
    }
  ],
  "KFTravelEntry": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "tagID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "itemID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "name",
      "type": "String",
      "optional": false
    },
    {
      "key": "quantity",
      "type": "Int",
      "optional": false,
      "default": 1
    },
    {
      "key": "scannedAt",
      "type": "Date",
      "optional": true
    },
    {
      "key": "manuallyPacked",
      "type": "Bool",
      "optional": false,
      "default": false
    },
    {
      "key": "addedDuringLoading",
      "type": "Bool",
      "optional": false,
      "default": false
    }
  ],
  "KFInventoryScan": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "tagID",
      "type": "UUID",
      "optional": false
    },
    {
      "key": "tagName",
      "type": "String",
      "optional": false
    },
    {
      "key": "areaID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "tripID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "date",
      "type": "Date",
      "optional": false,
      "default": "$now"
    }
  ],
  "KFInventoryReport": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "title",
      "type": "String",
      "optional": false
    },
    {
      "key": "body",
      "type": "String",
      "optional": false
    },
    {
      "key": "createdAt",
      "type": "Date",
      "optional": false,
      "default": "$now"
    }
  ],
  "KFSmartPlacement": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "name",
      "type": "String",
      "optional": false
    },
    {
      "key": "isBuiltIn",
      "type": "Bool",
      "optional": false,
      "default": false
    }
  ]
};
// Build 113 device-only native record shapes; optional fields keep old records readable.
Object.assign(models, {
  "KFMaintenanceEntry": [
    {
      "key": "kennelID",
      "type": "UUID",
      "optional": false
    },
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "date",
      "type": "Date",
      "optional": false,
      "default": "$now"
    },
    {
      "key": "status",
      "type": "String",
      "optional": false,
      "default": "Repair"
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "inspection",
      "type": "String",
      "optional": false,
      "default": "Not Inspected"
    },
    {
      "key": "attachments",
      "type": "[String]",
      "optional": true
    },
    {
      "key": "dueDate",
      "type": "Date",
      "optional": true
    },
    {
      "key": "assignedStaffID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "assignedStaffName",
      "type": "String",
      "optional": true
    },
    {
      "key": "completed",
      "type": "Bool",
      "optional": true
    },
    {
      "key": "completedAt",
      "type": "Date",
      "optional": true
    },
    {
      "key": "recurrence",
      "type": "String",
      "optional": true
    },
    {
      "key": "reminderEnabled",
      "type": "Bool",
      "optional": true
    },
    {
      "key": "partsCents",
      "type": "Int64",
      "optional": true
    },
    {
      "key": "laborCents",
      "type": "Int64",
      "optional": true
    },
    {
      "key": "currencyCode",
      "type": "String",
      "optional": true
    },
    {
      "key": "nextOccurrenceID",
      "type": "UUID",
      "optional": true
    }
  ],
  "OFAXRayRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "dogID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "subjectName",
      "type": "String",
      "optional": false
    },
    {
      "key": "recordType",
      "type": "String",
      "optional": false,
      "default": "OFA"
    },
    {
      "key": "testName",
      "type": "String",
      "optional": false,
      "default": "Hips"
    },
    {
      "key": "date",
      "type": "Date",
      "optional": false,
      "default": "$now"
    },
    {
      "key": "result",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "certificateNumber",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "clinicOrLab",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "VeterinaryClinicRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "name",
      "type": "String",
      "optional": false
    },
    {
      "key": "veterinarian",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "phone",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "email",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "address",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "emergency",
      "type": "Bool",
      "optional": false,
      "default": false
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "VeterinaryServiceRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "subjectName",
      "type": "String",
      "optional": false
    },
    {
      "key": "clinicName",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "service",
      "type": "String",
      "optional": false
    },
    {
      "key": "date",
      "type": "Date",
      "optional": false,
      "default": "$now"
    },
    {
      "key": "cost",
      "type": "Double",
      "optional": false,
      "default": 0
    },
    {
      "key": "followUpDate",
      "type": "Date",
      "optional": true
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "EmployeeProfileRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "staffID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "displayName",
      "type": "String",
      "optional": false
    },
    {
      "key": "phone",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "jobTitle",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "emergencyContact",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "emergencyPhone",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "hireDate",
      "type": "Date",
      "optional": false,
      "default": "$now"
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "KennelMessageRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "recipientName",
      "type": "String",
      "optional": false
    },
    {
      "key": "recipientPhone",
      "type": "String",
      "optional": false
    },
    {
      "key": "body",
      "type": "String",
      "optional": false
    },
    {
      "key": "sentAt",
      "type": "Date",
      "optional": false,
      "default": "$now"
    },
    {
      "key": "recipientType",
      "type": "String",
      "optional": false,
      "default": "Client"
    }
  ],
  "EmployeeLocationRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "staffID",
      "type": "UUID",
      "optional": true
    },
    {
      "key": "staffName",
      "type": "String",
      "optional": false
    },
    {
      "key": "latitude",
      "type": "Double",
      "optional": false
    },
    {
      "key": "longitude",
      "type": "Double",
      "optional": false
    },
    {
      "key": "timestamp",
      "type": "Date",
      "optional": false,
      "default": "$now"
    }
  ],
  "PedigreeAncestorRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "subjectName",
      "type": "String",
      "optional": false
    },
    {
      "key": "generation",
      "type": "Int",
      "optional": false
    },
    {
      "key": "position",
      "type": "Int",
      "optional": false
    },
    {
      "key": "name",
      "type": "String",
      "optional": false
    },
    {
      "key": "registrationNumber",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "titles",
      "type": "String",
      "optional": false,
      "default": ""
    },
    {
      "key": "notes",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ],
  "PedigreeScanRecord": [
    {
      "key": "id",
      "type": "UUID",
      "optional": false,
      "default": "$uuid"
    },
    {
      "key": "subjectName",
      "type": "String",
      "optional": false
    },
    {
      "key": "createdAt",
      "type": "Date",
      "optional": false,
      "default": "$now"
    },
    {
      "key": "recognizedText",
      "type": "String",
      "optional": false,
      "default": ""
    }
  ]
});
export const collections = {
  "dogs": "Dog",
  "litters": "Litter",
  "healthRecords": "HealthRecord",
  "customers": "Customer",
  "tasks": "KennelTask",
  "training": "TrainingRecord",
  "equipment": "EquipmentItem",
  "kennels": "KennelRun",
  "puppies": "Puppy",
  "puppyMedicalRecords": "PuppyMedicalRecord",
  "breedingRecords": "BreedingRecord",
  "documents": "DocumentRecord",
  "contracts": "ContractRecord",
  "payments": "PaymentRecord",
  "groomingRecords": "GroomingRecord",
  "feedingPlans": "FeedingPlan",
  "supplementRecords": "SupplementRecord",
  "semenRecords": "SemenRecord",
  "scanFolders": "ScanFolderRecord",
  "scannedReports": "ScannedReport",
  "clients": "ClientRecord",
  "boardingRecords": "BoardingRecord",
  "calendarEvents": "KennelCalendarEvent",
  "employeeActivity": "EmployeeActivityRecord",
  "staffTimeEntries": "StaffTimeEntry",
  "kennelCareSessions": "KennelCareSession",
  "expenses": "ExpenseRecord",
  "dailyDutyShifts": "DutyShiftCategory",
  "dailyDutyTemplates": "DailyDutyTemplate",
  "dailyDutyRecords": "DailyDutyRecord",
  "smartTags": "KFSmartTag",
  "inventoryLocations": "KFInventoryLocation",
  "inventoryItems": "KFInventoryItem",
  "travelManifests": "KFTravelManifest",
  "inventoryScans": "KFInventoryScan",
  "inventoryReports": "KFInventoryReport",
  "smartPlacements": "KFSmartPlacement",
  "maintenanceRecords": "KFMaintenanceEntry",
  "ofaXrays": "OFAXRayRecord",
  "clinics": "VeterinaryClinicRecord",
  "vetServices": "VeterinaryServiceRecord",
  "employeeProfiles": "EmployeeProfileRecord",
  "messages": "KennelMessageRecord",
  "locations": "EmployeeLocationRecord",
  "pedigreeAncestors": "PedigreeAncestorRecord",
  "pedigreeScans": "PedigreeScanRecord"
};
